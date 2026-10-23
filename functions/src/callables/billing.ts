import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { type CallableRequest, HttpsError, onCall, onRequest } from 'firebase-functions/https';
import { randomUUID } from 'node:crypto';
import { type BillingInfo, checkoutInput, type Company, devBillingInput } from '@siteline/shared';

import { type BillingProvider, billingProvider } from '../adapters';
import { db } from '../lib/admin';
import { applyBillingEvent, billingRef, NO_BILLING } from '../lib/billing';
import { rejectDemo, requireStaff } from '../lib/context';
import { appUrl, billingSecrets, callableOptions, isEmulator } from '../lib/env';
import { parseInput } from '../lib/validate';

function requireOwner(request: CallableRequest<unknown>) {
  const caller = requireStaff(request);
  if (caller.role !== 'owner') throw new HttpsError('permission-denied', 'owners_only');
  rejectDemo(request);
  return caller;
}

async function billingOf(companyId: string): Promise<Omit<BillingInfo, 'updatedAt'>> {
  return {
    ...NO_BILLING,
    ...((await billingRef(db, companyId).get()).data() as BillingInfo | undefined),
  };
}

/** The company's billing customer, created on first use and mapped back for the webhook. */
async function customerFor(
  provider: BillingProvider,
  companyId: string,
  email: string | null,
): Promise<string> {
  const billing = await billingOf(companyId);
  if (billing.customerId) return billing.customerId;
  const company = (await db.doc(`companies/${companyId}`).get()).data() as Company;
  const customerId = await provider.createCustomer({
    companyId,
    name: company.name,
    email,
  });
  await db.doc(`billingCustomers/${customerId}`).set({ companyId });
  await billingRef(db, companyId).set(
    { ...NO_BILLING, customerId, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  return customerId;
}

/** Owners start a subscription in Stripe Checkout (PRD F10). Plan changes go through the portal. */
export async function createCheckoutSessionHandler(
  request: CallableRequest<unknown>,
  provider: BillingProvider = billingProvider(),
) {
  const caller = requireOwner(request);
  const input = parseInput(checkoutInput, request.data);
  const billing = await billingOf(caller.companyId);
  if (billing.subscriptionId && billing.status !== 'canceled')
    throw new HttpsError('failed-precondition', 'already_subscribed');
  const company = (await db.doc(`companies/${caller.companyId}`).get()).data() as Company;
  const customerId = await customerFor(provider, caller.companyId, caller.email);
  const back = `${appUrl.value()}/app/settings/billing`;
  return provider.createCheckout({
    customerId,
    companyId: caller.companyId,
    plan: input.plan,
    interval: input.interval,
    locale: company.locale,
    successUrl: `${back}?checkout=done`,
    cancelUrl: back,
  });
}

/** Owners manage the card, plan, invoices and cancellation in the Stripe Customer Portal. */
export async function createPortalSessionHandler(
  request: CallableRequest<unknown>,
  provider: BillingProvider = billingProvider(),
) {
  const caller = requireOwner(request);
  const billing = await billingOf(caller.companyId);
  if (!billing.customerId) throw new HttpsError('failed-precondition', 'no_subscription');
  const company = (await db.doc(`companies/${caller.companyId}`).get()).data() as Company;
  return provider.createPortal({
    customerId: billing.customerId,
    returnUrl: `${appUrl.value()}/app/settings/billing`,
    locale: company.locale,
  });
}

/**
 * Emulator only: plays Stripe's events for the caller's company, as the /dev/billing page's
 * buttons (pay, change plan, payment fails, cancel), through the webhook's handler.
 */
export async function devBillingHandler(request: CallableRequest<unknown>) {
  if (!isEmulator) throw new HttpsError('permission-denied', 'emulator_only');
  const caller = requireOwner(request);
  const input = parseInput(devBillingInput, request.data);
  const provider = billingProvider();
  const customerId = await customerFor(provider, caller.companyId, caller.email);
  const billing = await billingOf(caller.companyId);
  const subscriptionId = billing.subscriptionId ?? `sub_dev_${randomUUID().slice(0, 8)}`;
  const id = () => `evt_dev_${randomUUID()}`;
  const plan = input.plan ?? (billing.plan === 'free' ? 'solo' : billing.plan);
  const interval = input.interval ?? billing.interval ?? 'month';
  const end = new Date(Date.now() + (interval === 'year' ? 365 : 30) * 86_400_000);
  const changed = (status: 'active' | 'past_due' | 'canceled') =>
    applyBillingEvent(
      db,
      {
        type: 'subscription_changed',
        id: id(),
        customerId,
        subscriptionId,
        plan,
        interval,
        status,
        currentPeriodEnd: end,
      },
      provider,
    );
  switch (input.action) {
    case 'pay': {
      const first = !billing.subscriptionId;
      await applyBillingEvent(
        db,
        {
          type: 'checkout_completed',
          id: id(),
          customerId,
          companyId: caller.companyId,
          subscriptionId,
        },
        provider,
      );
      await changed('active');
      await applyBillingEvent(
        db,
        { type: 'invoice_paid', id: id(), customerId, firstPayment: first, amountOre: 0 },
        provider,
      );
      break;
    }
    case 'change':
      await changed('active');
      break;
    case 'fail':
      await applyBillingEvent(db, { type: 'payment_failed', id: id(), customerId }, provider);
      await changed('past_due');
      break;
    case 'cancel':
      await changed('canceled');
      break;
  }
  return { ok: true };
}

/** Stripe's webhook: verifies the signature, then applies the event once (PRD F10). */
export const stripeWebhook = onRequest({ secrets: billingSecrets }, async (req, res) => {
  const signature = req.header('stripe-signature');
  if (req.method !== 'POST' || !signature) {
    res.status(400).send('Bad request');
    return;
  }
  const provider = billingProvider();
  let event;
  try {
    event = provider.parseWebhook(req.rawBody, signature);
  } catch (error) {
    logger.warn('Stripe signature check failed', { error: String(error) });
    res.status(400).send('Invalid signature');
    return;
  }
  if (event) await applyBillingEvent(db, event, provider);
  res.status(200).send('ok');
});

const billingOptions = { ...callableOptions, secrets: billingSecrets };
export const createCheckoutSession = onCall(billingOptions, (request) =>
  createCheckoutSessionHandler(request),
);
export const createPortalSession = onCall(billingOptions, (request) =>
  createPortalSessionHandler(request),
);
export const devBilling = onCall(callableOptions, devBillingHandler);

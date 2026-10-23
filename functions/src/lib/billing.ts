import { FieldValue, type Firestore, Timestamp } from 'firebase-admin/firestore';
import {
  type BillingInfo,
  type Company,
  type Plan,
  PLAN_LIMITS,
  planPriceOre,
  type Referral,
  VAT_RATE_SUBSCRIPTIONS,
} from '@siteline/shared';

import type { BillingEvent, BillingProvider } from '../adapters/types';
import { appUrl } from './env';
import { recordEvent } from './metrics';
import { queueMessage } from './outbox';

export const billingRef = (db: Firestore, companyId: string) =>
  db.doc(`companies/${companyId}/private/billing`);

export const NO_BILLING: Omit<BillingInfo, 'updatedAt'> = {
  customerId: null,
  subscriptionId: null,
  status: 'none',
  plan: 'free',
  interval: null,
  currentPeriodEnd: null,
  pendingFreeMonths: 0,
};

/** One month of a plan, VAT included: the referral reward's size (PRD F20, section 16). */
export function oneMonthOre(plan: Plan): number {
  return Math.round(planPriceOre(plan, 'month') * (1 + VAT_RATE_SUBSCRIPTIONS));
}

async function companyForCustomer(db: Firestore, customerId: string): Promise<string | null> {
  return (
    ((await db.doc(`billingCustomers/${customerId}`).get()).get('companyId') as string) ?? null
  );
}

/**
 * Applies one billing event to Siteline (PRD F10): the webhook and the emulator's /dev/billing
 * page both come through here. Each event applies once. Downgrading and cancelling change the
 * plan and limits only; no data is ever deleted.
 */
export async function applyBillingEvent(
  db: Firestore,
  event: BillingEvent,
  provider: BillingProvider,
  now = new Date(),
): Promise<boolean> {
  try {
    await db
      .doc(`billingEvents/${event.id}`)
      .create({ type: event.type, at: Timestamp.fromDate(now) });
  } catch {
    return false; // Already applied.
  }
  const companyId =
    (event.type === 'checkout_completed' ? event.companyId : null) ??
    (await companyForCustomer(db, event.customerId));
  if (!companyId) return false;
  const ref = billingRef(db, companyId);
  const updatedAt = FieldValue.serverTimestamp();

  switch (event.type) {
    case 'checkout_completed':
      await ref.set(
        { customerId: event.customerId, subscriptionId: event.subscriptionId, updatedAt },
        { merge: true },
      );
      break;

    case 'subscription_changed': {
      const plan = event.status === 'canceled' ? 'free' : event.plan;
      await ref.set(
        {
          customerId: event.customerId,
          subscriptionId: event.status === 'canceled' ? null : event.subscriptionId,
          status: event.status,
          plan,
          interval: event.status === 'canceled' ? null : event.interval,
          currentPeriodEnd: event.currentPeriodEnd
            ? Timestamp.fromDate(event.currentPeriodEnd)
            : null,
          updatedAt,
        },
        { merge: true },
      );
      await db.doc(`companies/${companyId}`).update({
        plan,
        limits: PLAN_LIMITS[plan],
        updatedAt,
      });
      if (event.status === 'active') await creditPendingMonths(db, companyId, provider);
      break;
    }

    case 'invoice_paid':
      await ref.set({ status: 'active', updatedAt }, { merge: true });
      if (event.firstPayment) {
        await recordEvent(db, {
          name: 'first_payment',
          companyId,
          props: { amountOre: event.amountOre },
        });
        await rewardReferrer(db, companyId, provider, now);
      }
      break;

    case 'payment_failed':
      await ref.set({ status: 'past_due', updatedAt }, { merge: true });
      await tellOwners(db, companyId, event.id);
      break;
  }
  return true;
}

/**
 * The invite reward (PRD F20): when a company that came from a client's invite first pays, the
 * firm the invite came from gets one month free, exactly once. A paying firm gets it as credit
 * on its next invoice; a firm without a subscription gets it when it subscribes.
 */
async function rewardReferrer(
  db: Firestore,
  companyId: string,
  provider: BillingProvider,
  now: Date,
): Promise<void> {
  const company = (await db.doc(`companies/${companyId}`).get()).data() as Company | undefined;
  const code = company?.referredBy?.code;
  if (!code) return;
  const referralRef = db.doc(`referrals/${code}`);
  const sourceId = await db.runTransaction(async (tx) => {
    const referral = (await tx.get(referralRef)).data() as Referral<Timestamp> | undefined;
    if (!referral || referral.rewardGrantedAt || referral.signedUpCompanyId !== companyId)
      return null;
    tx.update(referralRef, {
      firstPaidAt: referral.firstPaidAt ?? Timestamp.fromDate(now),
      rewardGrantedAt: Timestamp.fromDate(now),
    });
    tx.set(
      billingRef(db, referral.sourceCompanyId),
      { pendingFreeMonths: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    return referral.sourceCompanyId;
  });
  if (sourceId) await creditPendingMonths(db, sourceId, provider);
}

/** Turns earned free months into credit once the firm has an active subscription. */
async function creditPendingMonths(
  db: Firestore,
  companyId: string,
  provider: BillingProvider,
): Promise<void> {
  const ref = billingRef(db, companyId);
  const claimed = await db.runTransaction(async (tx) => {
    const billing = (await tx.get(ref)).data() as BillingInfo | undefined;
    if (!billing?.customerId || billing.status !== 'active' || billing.plan === 'free') return null;
    if (!billing.pendingFreeMonths) return null;
    tx.update(ref, { pendingFreeMonths: 0 });
    return billing;
  });
  if (!claimed) return;
  await provider.grantCredit(
    claimed.customerId!,
    claimed.pendingFreeMonths * oneMonthOre(claimed.plan),
    'Siteline: gratis månad för en kunds inbjudan',
  );
}

/** Owners hear by email when a payment fails, with a link to update the card. */
async function tellOwners(db: Firestore, companyId: string, eventId: string): Promise<void> {
  const owners = await db
    .collection(`companies/${companyId}/staff`)
    .where('role', '==', 'owner')
    .get();
  const company = (await db.doc(`companies/${companyId}`).get()).data() as Company | undefined;
  for (const owner of owners.docs) {
    const email = owner.get('email') as string | null;
    if (!email) continue;
    await queueMessage(db, {
      channel: 'email',
      to: { uid: owner.id, email },
      recipientKind: 'staff',
      template: 'paymentFailed',
      params: { link: `${appUrl.value()}/app/settings/billing` },
      locale: company?.locale ?? 'sv',
      companyId,
      projectId: null,
      dedupeKey: `paymentFailed:${eventId}:${owner.id}`,
    });
  }
}

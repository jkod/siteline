import { Timestamp } from 'firebase-admin/firestore';
import Stripe from 'stripe';
import { PLAN_LIMITS } from '@siteline/shared';

import { StripeBillingProvider } from '../../functions/src/adapters/stripe-billing';
import type { BillingEvent, BillingProvider } from '../../functions/src/adapters/types';
import {
  createCheckoutSessionHandler,
  createPortalSessionHandler,
} from '../../functions/src/callables/billing';
import { createProjectHandler } from '../../functions/src/callables/projects';
import { applyBillingEvent, oneMonthOre } from '../../functions/src/lib/billing';
import { syncEndedComps } from '../../functions/src/scheduled/maintenance';
import { syncBranding } from '../../functions/src/triggers/company';
import {
  addStaff,
  companyWithOwner,
  db,
  failure,
  outbox,
  request,
  resetEmulators,
  signedInUser,
} from './harness';

beforeEach(resetEmulators);

/** A provider that records what Siteline asks of it. */
function fakeProvider() {
  const credits: { customerId: string; amountOre: number }[] = [];
  const checkouts: unknown[] = [];
  const provider: BillingProvider = {
    createCustomer: async ({ companyId }) => `cus_${companyId}`,
    createCheckout: async (input) => (checkouts.push(input), { url: 'https://checkout.test/s' }),
    createPortal: async () => ({ url: 'https://portal.test/p' }),
    grantCredit: async (customerId, amountOre) => void credits.push({ customerId, amountOre }),
    parseWebhook: () => null,
  };
  return { provider, credits, checkouts };
}

let n = 0;
const id = () => `evt_${++n}_${Date.now()}`;
const subscribed = (
  customerId: string,
  plan: 'visits' | 'solo' | 'team' | 'pro',
  status: 'active' | 'past_due' | 'canceled' = 'active',
): BillingEvent => ({
  type: 'subscription_changed',
  id: id(),
  customerId,
  subscriptionId: `sub_${customerId}`,
  plan,
  interval: 'month',
  status,
  currentPeriodEnd: new Date('2026-12-01T00:00:00Z'),
});
const company = async (cid: string) => (await db.doc(`companies/${cid}`).get()).data()!;
const billing = async (cid: string) =>
  (await db.doc(`companies/${cid}/private/billing`).get()).data()!;

async function subscribedCompany(cid: string, owner: string, plan: 'solo' | 'team' = 'solo') {
  const caller = await companyWithOwner(cid, owner);
  const { provider } = fakeProvider();
  await createCheckoutSessionHandler(request(caller, { plan, interval: 'month' }), provider);
  await applyBillingEvent(db, subscribed(`cus_${cid}`, plan), provider);
  return caller;
}

describe('checkout and portal', () => {
  it('lets owners start checkout, with a customer mapped back to the company', async () => {
    const owner = await companyWithOwner('c1', 'erik');
    const { provider, checkouts } = fakeProvider();
    await expect(
      createCheckoutSessionHandler(request(owner, { plan: 'team', interval: 'year' }), provider),
    ).resolves.toEqual({ url: 'https://checkout.test/s' });
    expect(checkouts[0]).toMatchObject({
      customerId: 'cus_c1',
      companyId: 'c1',
      plan: 'team',
      interval: 'year',
      successUrl: 'http://localhost:4300/app/settings/billing?checkout=done',
    });
    expect((await db.doc('billingCustomers/cus_c1').get()).get('companyId')).toBe('c1');
    expect(await createPortalSessionHandler(request(owner, {}), provider)).toEqual({
      url: 'https://portal.test/p',
    });
  });

  it('is for owners only, and not in sandboxes', async () => {
    await companyWithOwner('c1', 'erik');
    await addStaff('c1', 'alva', 'admin', 'Alva');
    const admin = await signedInUser('alva', 'alva@example.com', { cid: 'c1', crole: 'admin' });
    const { provider } = fakeProvider();
    const input = { plan: 'solo', interval: 'month' };
    expect(
      (await failure(createCheckoutSessionHandler(request(admin, input), provider))).message,
    ).toBe('owners_only');
    const demo = { uid: 'd', token: { cid: 'c1', crole: 'owner', demo: true } };
    expect(
      (await failure(createCheckoutSessionHandler(request(demo, input), provider))).message,
    ).toBe('demo_mode');
  });
});

describe('the subscription lifecycle (PRD F10)', () => {
  it('starts, upgrades, downgrades without deleting anything, fails a payment and cancels', async () => {
    const owner = await subscribedCompany('c1', 'erik', 'solo');
    const { provider } = fakeProvider();
    expect(await company('c1')).toMatchObject({ plan: 'solo', limits: PLAN_LIMITS.solo });
    expect(await billing('c1')).toMatchObject({
      status: 'active',
      plan: 'solo',
      interval: 'month',
    });

    await applyBillingEvent(db, subscribed('cus_c1', 'team'), provider);
    expect(await company('c1')).toMatchObject({ plan: 'team', limits: PLAN_LIMITS.team });

    // Six active projects on Team, then back to Solo (5): nothing is lost, new ones are blocked.
    await db.doc('companies/c1').update({ 'usage.activeProjects': 6 });
    await applyBillingEvent(db, subscribed('cus_c1', 'solo'), provider);
    expect(await company('c1')).toMatchObject({ plan: 'solo', usage: { activeProjects: 6 } });
    expect((await failure(createProjectHandler(request(owner, { title: 'Sjunde' })))).message).toBe(
      'plan_limit',
    );

    await applyBillingEvent(
      db,
      { type: 'payment_failed', id: id(), customerId: 'cus_c1' },
      provider,
    );
    expect((await billing('c1'))['status']).toBe('past_due');
    expect((await outbox()).filter((m) => m.template === 'paymentFailed')).toHaveLength(1);

    await applyBillingEvent(db, subscribed('cus_c1', 'solo', 'canceled'), provider);
    expect(await company('c1')).toMatchObject({ plan: 'free', limits: PLAN_LIMITS.free });
    expect(await billing('c1')).toMatchObject({ status: 'canceled', subscriptionId: null });
  });

  it('applies each event once', async () => {
    await subscribedCompany('c1', 'erik', 'solo');
    const { provider } = fakeProvider();
    const event = subscribed('cus_c1', 'team');
    expect(await applyBillingEvent(db, event, provider)).toBe(true);
    await db.doc('companies/c1').update({ plan: 'solo' });
    expect(await applyBillingEvent(db, event, provider)).toBe(false);
    expect((await company('c1'))['plan']).toBe('solo');
  });
});

describe('the invite reward (F20)', () => {
  async function referred(code: string, from: string, to: string) {
    await db.doc(`referrals/${code}`).set({
      clientUid: 'anna',
      firstName: null,
      sourceCompanyId: from,
      sourceProjectId: 'p1',
      businessKind: 'garden',
      openedCount: 1,
      signedUpCompanyId: to,
      firstPaidAt: null,
      rewardGrantedAt: null,
      createdAt: Timestamp.now(),
    });
    await db
      .doc(`companies/${to}`)
      .update({ referredBy: { code, companyId: from, clientUid: 'anna' } });
  }

  it('credits the inviting firm one month, once, when the new company first pays', async () => {
    await subscribedCompany('c1', 'erik', 'team');
    await subscribedCompany('c2', 'lo', 'solo');
    await referred('ABCDEFGH23', 'c1', 'c2');
    const { provider, credits } = fakeProvider();
    const paid = (first: boolean): BillingEvent => ({
      type: 'invoice_paid',
      id: id(),
      customerId: 'cus_c2',
      firstPayment: first,
      amountOre: 37_375,
    });
    await applyBillingEvent(db, paid(true), provider);
    expect(credits).toEqual([{ customerId: 'cus_c1', amountOre: oneMonthOre('team') }]);
    expect(oneMonthOre('team')).toBe(98_750);
    const referral = (await db.doc('referrals/ABCDEFGH23').get()).data()!;
    expect(referral['firstPaidAt']).toBeTruthy();
    expect(referral['rewardGrantedAt']).toBeTruthy();

    await applyBillingEvent(db, paid(true), provider);
    await applyBillingEvent(db, paid(false), provider);
    expect(credits).toHaveLength(1);
  });

  it('keeps the free month for a firm without a subscription until it subscribes', async () => {
    await companyWithOwner('c1', 'erik');
    await subscribedCompany('c2', 'lo', 'solo');
    await referred('ABCDEFGH24', 'c1', 'c2');
    const { provider, credits } = fakeProvider();
    await applyBillingEvent(
      db,
      { type: 'invoice_paid', id: id(), customerId: 'cus_c2', firstPayment: true, amountOre: 1 },
      provider,
    );
    expect(credits).toEqual([]);
    expect((await billing('c1'))['pendingFreeMonths']).toBe(1);

    await db.doc('billingCustomers/cus_c1').set({ companyId: 'c1' });
    await applyBillingEvent(db, subscribed('cus_c1', 'solo'), provider);
    expect(credits).toEqual([{ customerId: 'cus_c1', amountOre: oneMonthOre('solo') }]);
    expect((await billing('c1'))['pendingFreeMonths']).toBe(0);
  });
});

describe('plan features in the client view', () => {
  async function brandingAfterSync(cid: string, fields: Record<string, unknown>, now = new Date()) {
    await companyWithOwner(cid, `${cid}-owner`);
    await db.doc(`companies/${cid}`).update({ accentColor: '#AA3355', ...fields });
    await db.doc(`projects/${cid}-p`).set({ companyId: cid, branding: {} });
    await syncBranding(db, cid, (await company(cid)) as never, now);
    return (await db.doc(`projects/${cid}-p`).get()).get('branding');
  }

  it('shows the colour from Team, and the footer only on Free and Visits', async () => {
    expect(await brandingAfterSync('free1', { plan: 'free' })).toMatchObject({
      accentColor: '#127A69',
      showSitelineFooter: true,
    });
    expect(await brandingAfterSync('solo1', { plan: 'solo' })).toMatchObject({
      accentColor: '#127A69',
      showSitelineFooter: false,
    });
    expect(await brandingAfterSync('team1', { plan: 'team' })).toMatchObject({
      accentColor: '#AA3355',
      showSitelineFooter: false,
    });
  });

  it('gives design partners Team until compedUntil, then the daily job resyncs', async () => {
    const until = new Date('2026-11-01T00:00:00Z');
    expect(
      await brandingAfterSync(
        'dp',
        { plan: 'free', compedUntil: Timestamp.fromDate(until) },
        new Date('2026-10-30T00:00:00Z'),
      ),
    ).toMatchObject({ accentColor: '#AA3355', showSitelineFooter: false });
    expect(await syncEndedComps(db, new Date('2026-11-01T06:00:00Z'))).toBe(1);
    expect((await db.doc('projects/dp-p').get()).get('branding')).toMatchObject({
      accentColor: '#127A69',
      showSitelineFooter: true,
    });
  });
});

describe('the Stripe webhook', () => {
  const config = {
    secretKey: 'sk_test_x',
    webhookSecret: 'whsec_test_secret',
    prices: { solo_month: 'price_solo_m', team_year: 'price_team_y' },
    taxRateId: 'txr_25',
  };
  const signed = (event: object) => {
    const payload = JSON.stringify(event);
    const header = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: config.webhookSecret,
    });
    return { body: Buffer.from(payload), header };
  };

  it('verifies the signature and reads subscriptions and invoices', () => {
    const stripe = new StripeBillingProvider(config);
    const sub = signed({
      id: 'evt_1',
      object: 'event',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          customer: 'cus_1',
          status: 'past_due',
          items: { data: [{ price: { id: 'price_team_y' }, current_period_end: 1_790_000_000 }] },
        },
      },
    });
    expect(stripe.parseWebhook(sub.body, sub.header)).toEqual({
      type: 'subscription_changed',
      id: 'evt_1',
      customerId: 'cus_1',
      subscriptionId: 'sub_1',
      plan: 'team',
      interval: 'year',
      status: 'past_due',
      currentPeriodEnd: new Date(1_790_000_000_000),
    });
    const invoice = signed({
      id: 'evt_2',
      object: 'event',
      type: 'invoice.paid',
      data: {
        object: { customer: 'cus_1', billing_reason: 'subscription_create', amount_paid: 37_375 },
      },
    });
    expect(stripe.parseWebhook(invoice.body, invoice.header)).toEqual({
      type: 'invoice_paid',
      id: 'evt_2',
      customerId: 'cus_1',
      firstPayment: true,
      amountOre: 37_375,
    });
  });

  it('rejects bad signatures and ignores unknown prices and events', () => {
    const stripe = new StripeBillingProvider(config);
    const ok = signed({
      id: 'evt_3',
      object: 'event',
      type: 'customer.created',
      data: { object: { customer: 'cus_1' } },
    });
    expect(stripe.parseWebhook(ok.body, ok.header)).toBeNull();
    expect(() => stripe.parseWebhook(ok.body, 't=1,v1=bad')).toThrow();
    const unknown = signed({
      id: 'evt_4',
      object: 'event',
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_2',
          customer: 'cus_1',
          status: 'active',
          items: { data: [{ price: { id: 'price_other' } }] },
        },
      },
    });
    expect(stripe.parseWebhook(unknown.body, unknown.header)).toBeNull();
  });
});

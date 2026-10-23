import Stripe from 'stripe';
import type { BillingInterval, PaidPlan, Plan } from '@siteline/shared';

import type { BillingEvent, BillingProvider, CheckoutInput } from './types';

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  /** Price IDs by plan and interval, such as { solo_month: 'price_…', solo_year: 'price_…' }. */
  prices: Record<string, string>;
  /** The 25% Swedish VAT rate, added to every invoice (the user's choice). */
  taxRateId: string;
}

type Obj = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
/** An ID from a field that may hold the ID or the expanded object. */
const idOf = (v: unknown): string | null => str(v) ?? str(obj(v)['id']);

const STATUS: Record<string, 'active' | 'past_due' | 'canceled'> = {
  active: 'active',
  trialing: 'active',
  past_due: 'past_due',
  unpaid: 'past_due',
  incomplete: 'past_due',
  canceled: 'canceled',
  incomplete_expired: 'canceled',
  paused: 'canceled',
};

/** Stripe Billing: Checkout, the Customer Portal and a signed webhook (PRD F10). */
export class StripeBillingProvider implements BillingProvider {
  private readonly stripe: Stripe;
  private readonly planByPrice: Map<string, { plan: Plan; interval: BillingInterval }>;

  constructor(private readonly config: StripeConfig) {
    this.stripe = new Stripe(config.secretKey);
    this.planByPrice = new Map(
      Object.entries(config.prices).map(([key, price]) => {
        const [plan, interval] = key.split('_') as [Plan, BillingInterval];
        return [price, { plan, interval }];
      }),
    );
  }

  async createCustomer(input: { companyId: string; name: string; email: string | null }) {
    const customer = await this.stripe.customers.create({
      name: input.name,
      email: input.email ?? undefined,
      metadata: { companyId: input.companyId },
    });
    return customer.id;
  }

  async createCheckout(input: CheckoutInput) {
    const price = this.priceFor(input.plan, input.interval);
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: input.customerId,
      client_reference_id: input.companyId,
      line_items: [{ price, quantity: 1 }],
      subscription_data: {
        default_tax_rates: [this.config.taxRateId],
        metadata: { companyId: input.companyId },
      },
      tax_id_collection: { enabled: true },
      customer_update: { name: 'auto', address: 'auto' },
      locale: input.locale,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });
    if (!session.url) throw new Error('Stripe returned no checkout URL');
    return { url: session.url };
  }

  async createPortal(input: { customerId: string; returnUrl: string; locale: 'sv' | 'en' }) {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: input.customerId,
      return_url: input.returnUrl,
      locale: input.locale,
    });
    return { url: session.url };
  }

  async grantCredit(customerId: string, amountOre: number, description: string) {
    await this.stripe.customers.createBalanceTransaction(customerId, {
      amount: -amountOre,
      currency: 'sek',
      description,
    });
  }

  parseWebhook(rawBody: Buffer, signature: string): BillingEvent | null {
    const event = this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.config.webhookSecret,
    );
    const o = obj(event.data.object);
    const customerId = idOf(o['customer']);
    if (!customerId) return null;
    switch (event.type) {
      case 'checkout.session.completed':
        return {
          type: 'checkout_completed',
          id: event.id,
          customerId,
          companyId: str(o['client_reference_id']),
          subscriptionId: idOf(o['subscription']),
        };
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const item = obj((obj(o['items'])['data'] as unknown[] | undefined)?.[0]);
        const price = idOf(item['price']);
        const known = price ? this.planByPrice.get(price) : undefined;
        if (!known) return null;
        const status =
          event.type === 'customer.subscription.deleted'
            ? 'canceled'
            : (STATUS[str(o['status']) ?? ''] ?? 'canceled');
        // Newer API versions keep the period on the item; older ones on the subscription.
        const end = Number(item['current_period_end'] ?? o['current_period_end']);
        return {
          type: 'subscription_changed',
          id: event.id,
          customerId,
          subscriptionId: str(o['id'])!,
          plan: known.plan,
          interval: known.interval,
          status,
          currentPeriodEnd: Number.isFinite(end) && end > 0 ? new Date(end * 1000) : null,
        };
      }
      case 'invoice.paid':
        return {
          type: 'invoice_paid',
          id: event.id,
          customerId,
          firstPayment: o['billing_reason'] === 'subscription_create',
          amountOre: Number(o['amount_paid'] ?? 0),
        };
      case 'invoice.payment_failed':
        return { type: 'payment_failed', id: event.id, customerId };
      default:
        return null;
    }
  }

  private priceFor(plan: PaidPlan, interval: BillingInterval): string {
    const price = this.config.prices[`${plan}_${interval}`];
    if (!price) throw new Error(`No Stripe price for ${plan} per ${interval}`);
    return price;
  }
}

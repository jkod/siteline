import { FieldValue, type Firestore } from 'firebase-admin/firestore';

import type { BillingEvent, BillingProvider, CheckoutInput } from './types';

/**
 * The emulator's billing provider: checkout and the portal open the app's /dev/billing page,
 * which plays Stripe's events through the same handler as the webhook. Credits are logged.
 */
export class DevBillingProvider implements BillingProvider {
  constructor(
    private readonly db: Firestore,
    private readonly appUrl: string,
  ) {}

  async createCustomer(input: { companyId: string }) {
    return `cus_dev_${input.companyId}`;
  }

  async createCheckout(input: CheckoutInput) {
    const query = new URLSearchParams({
      checkout: '1',
      plan: input.plan,
      interval: input.interval,
    });
    return { url: `${this.appUrl}/dev/billing?${query}` };
  }

  async createPortal() {
    return { url: `${this.appUrl}/dev/billing` };
  }

  async grantCredit(customerId: string, amountOre: number, description: string) {
    await this.db
      .collection('devBillingCredits')
      .add({ customerId, amountOre, description, createdAt: FieldValue.serverTimestamp() });
  }

  parseWebhook(): BillingEvent | null {
    return null;
  }
}

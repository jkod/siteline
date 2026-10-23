import type { BillingInterval, Locale, PaidPlan, Plan } from '@siteline/shared';

// Every outside service is called through one of these interfaces (PRD section 9). Each has
// one real implementation, plus a dev one that writes to the emulator's dev outbox.

export interface SmsMessage {
  to: string;
  /** Up to 11 characters where the provider allows it, otherwise "Siteline". */
  sender: string;
  text: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface PushMessage {
  tokens: string[];
  title: string;
  body: string;
  link: string;
}

export interface SendResult {
  providerMessageId: string;
}

export interface SmsSender {
  send(message: SmsMessage): Promise<SendResult>;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<SendResult>;
}

export interface PushSender {
  send(message: PushMessage): Promise<SendResult>;
}

export interface SpeechDraft {
  transcript: string;
  draft: string | null;
}

export interface SpeechAudio {
  /** The recording in Cloud Storage, as a gs:// URI. */
  uri: string;
  contentType: string;
}

export interface SpeechDrafter {
  /**
   * Transcribes audio and rewrites it as a short update in the project's language. Receives only
   * the audio and the language, never names or phone numbers (PRD section 7).
   */
  draft(audio: SpeechAudio, locale: Locale): Promise<SpeechDraft>;
}

export interface PdfRenderer {
  render(definition: unknown): Promise<Buffer>;
}

export interface CheckoutInput {
  customerId: string;
  companyId: string;
  plan: PaidPlan;
  interval: BillingInterval;
  locale: Locale;
  successUrl: string;
  cancelUrl: string;
}

/** A billing provider's event, reduced to what Siteline needs (PRD F10). */
export type BillingEvent =
  | {
      type: 'checkout_completed';
      id: string;
      customerId: string;
      companyId: string | null;
      subscriptionId: string | null;
    }
  | {
      type: 'subscription_changed';
      id: string;
      customerId: string;
      subscriptionId: string;
      plan: Plan;
      interval: BillingInterval | null;
      status: 'active' | 'past_due' | 'canceled';
      currentPeriodEnd: Date | null;
    }
  | {
      type: 'invoice_paid';
      id: string;
      customerId: string;
      firstPayment: boolean;
      amountOre: number;
    }
  | { type: 'payment_failed'; id: string; customerId: string };

export interface BillingProvider {
  createCustomer(input: { companyId: string; name: string; email: string | null }): Promise<string>;
  createCheckout(input: CheckoutInput): Promise<{ url: string }>;
  createPortal(input: {
    customerId: string;
    returnUrl: string;
    locale: Locale;
  }): Promise<{ url: string }>;
  /** Credits the customer's balance, used on their next invoices (the referral reward, F20). */
  grantCredit(customerId: string, amountOre: number, description: string): Promise<void>;
  /** Verifies the signature and reduces the event; null for events Siteline ignores. */
  parseWebhook(rawBody: Buffer, signature: string): BillingEvent | null;
}

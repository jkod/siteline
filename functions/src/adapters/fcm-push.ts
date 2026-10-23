import type { Messaging } from 'firebase-admin/messaging';

import type { PushMessage, PushSender, SendResult } from './types';

/** Tokens that will never work again, so their devices can be forgotten. */
const GONE = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/**
 * Web push through Firebase Cloud Messaging (PRD section 7). Messages are data-only: the app's
 * push service worker shows them and opens the link, the same in every browser.
 */
export class FcmPushSender implements PushSender {
  constructor(private readonly messaging: Messaging) {}

  async send(message: PushMessage): Promise<SendResult> {
    const result = await this.messaging.sendEachForMulticast({
      tokens: message.tokens,
      data: { title: message.title, body: message.body, link: message.link },
      webpush: { headers: { Urgency: 'high', TTL: String(24 * 3600) } },
    });
    const invalidTokens = result.responses.flatMap((r, i) =>
      !r.success && r.error && GONE.has(r.error.code) ? [message.tokens[i]!] : [],
    );
    if (result.successCount === 0 && invalidTokens.length < message.tokens.length) {
      throw Object.assign(new Error('push_failed'), { name: 'PushProviderError' });
    }
    return {
      providerMessageId: result.responses.find((r) => r.success)?.messageId ?? '',
      invalidTokens,
    };
  }
}

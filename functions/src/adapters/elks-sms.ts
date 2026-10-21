import type { SendResult, SmsMessage, SmsSender } from './types';

const ENDPOINT = 'https://api.46elks.com/a1/sms';

export class SmsProviderError extends Error {
  constructor(
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(`SMS provider responded ${status}`);
    this.name = 'SmsProviderError';
  }
}

/**
 * Sends text messages through 46elks (PRD section 16). Errors carry only the status code, never
 * the number or text.
 */
export class ElksSmsSender implements SmsSender {
  constructor(
    private readonly credentials: { username: string; password: string },
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async send(message: SmsMessage): Promise<SendResult> {
    const auth = Buffer.from(`${this.credentials.username}:${this.credentials.password}`).toString(
      'base64',
    );
    const response = await this.fetchFn(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ from: message.sender, to: message.to, message: message.text }),
    });
    if (!response.ok) {
      throw new SmsProviderError(
        response.status,
        response.status === 429 || response.status >= 500,
      );
    }
    const body = (await response.json()) as { id?: string };
    if (!body.id) throw new SmsProviderError(response.status, true);
    return { providerMessageId: body.id };
  }
}

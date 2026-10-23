import type { Messaging } from 'firebase-admin/messaging';

import { FcmPushSender } from './fcm-push';

function messaging(responses: { success: boolean; messageId?: string; code?: string }[]) {
  const sendEachForMulticast = vi.fn(async () => ({
    successCount: responses.filter((r) => r.success).length,
    failureCount: responses.filter((r) => !r.success).length,
    responses: responses.map((r) => ({
      success: r.success,
      messageId: r.messageId,
      error: r.code ? { code: r.code } : undefined,
    })),
  }));
  return { sendEachForMulticast, messaging: { sendEachForMulticast } as unknown as Messaging };
}

const message = {
  tokens: ['t1', 't2'],
  title: 'Ny fråga',
  body: 'Anna frågar om uttaget',
  link: 'https://app/x',
};

describe('FcmPushSender', () => {
  it('sends a data-only message to every device and reports dead tokens', async () => {
    const { sendEachForMulticast, messaging: m } = messaging([
      { success: true, messageId: 'm1' },
      { success: false, code: 'messaging/registration-token-not-registered' },
    ]);
    await expect(new FcmPushSender(m).send(message)).resolves.toEqual({
      providerMessageId: 'm1',
      invalidTokens: ['t2'],
    });
    expect(sendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: ['t1', 't2'],
        data: { title: 'Ny fråga', body: 'Anna frågar om uttaget', link: 'https://app/x' },
      }),
    );
  });

  it('fails, to be retried, when no device took it for a temporary reason', async () => {
    const { messaging: m } = messaging([
      { success: false, code: 'messaging/internal-error' },
      { success: false, code: 'messaging/server-unavailable' },
    ]);
    await expect(new FcmPushSender(m).send(message)).rejects.toThrow('push_failed');
  });

  it('does not retry when every device is gone', async () => {
    const { messaging: m } = messaging([
      { success: false, code: 'messaging/registration-token-not-registered' },
      { success: false, code: 'messaging/invalid-registration-token' },
    ]);
    await expect(new FcmPushSender(m).send(message)).resolves.toMatchObject({
      invalidTokens: ['t1', 't2'],
    });
  });
});

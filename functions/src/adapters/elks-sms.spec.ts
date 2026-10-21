import { ElksSmsSender, SmsProviderError } from './elks-sms';

function fakeFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });
}

describe('ElksSmsSender', () => {
  const message = { to: '+46701740605', sender: 'Ek och Lind', text: 'Hej Anna!' };

  it('posts the message with basic auth and returns the provider ID', async () => {
    const fetchFn = fakeFetch(200, { id: 's123' });
    const sender = new ElksSmsSender(
      { username: 'u', password: 'p' },
      fetchFn as unknown as typeof fetch,
    );
    await expect(sender.send(message)).resolves.toEqual({ providerMessageId: 's123' });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.46elks.com/a1/sms');
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('u:p').toString('base64')}`);
    expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({
      from: 'Ek och Lind',
      to: '+46701740605',
      message: 'Hej Anna!',
    });
  });

  it('marks rate limits and server errors as retryable, and client errors as not', async () => {
    for (const [status, retryable] of [
      [429, true],
      [503, true],
      [400, false],
      [401, false],
    ] as const) {
      const sender = new ElksSmsSender(
        { username: 'u', password: 'p' },
        fakeFetch(status, {}) as unknown as typeof fetch,
      );
      const error = await sender.send(message).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(SmsProviderError);
      expect((error as SmsProviderError).retryable).toBe(retryable);
      // Errors carry only the status, never the number or text.
      expect((error as Error).message).not.toContain('+46');
    }
  });
});

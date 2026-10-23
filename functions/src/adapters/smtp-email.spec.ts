import type { Transporter } from 'nodemailer';

import { htmlEmail } from '../lib/email-html';
import { EmailProviderError, SmtpEmailSender } from './smtp-email';

function fakeTransport(result: () => Promise<unknown>) {
  const sendMail = vi.fn(result);
  return { sendMail, transport: { sendMail } as unknown as Transporter };
}

describe('SmtpEmailSender', () => {
  const message = {
    to: 'anna@example.com',
    subject: 'Hej',
    text: 'Hej Anna',
    html: '<p>Hej Anna</p>',
  };

  it('sends from the configured address and returns the message ID', async () => {
    const { sendMail, transport } = fakeTransport(async () => ({ messageId: '<m1@smtp>' }));
    const sender = new SmtpEmailSender(
      { url: 'smtp://x', from: 'Siteline <hej@example.eu>' },
      transport,
    );
    await expect(sender.send(message)).resolves.toEqual({ providerMessageId: '<m1@smtp>' });
    expect(sendMail).toHaveBeenCalledWith({ from: 'Siteline <hej@example.eu>', ...message });
  });

  it('retries temporary failures but not permanent ones', async () => {
    for (const [code, retryable] of [
      [421, true],
      [undefined, true],
      [550, false],
    ] as const) {
      const { transport } = fakeTransport(async () => {
        throw Object.assign(new Error('smtp'), { responseCode: code });
      });
      const error = await new SmtpEmailSender({ url: 'x', from: 'x' }, transport)
        .send(message)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(EmailProviderError);
      expect((error as EmailProviderError).retryable).toBe(retryable);
      expect((error as Error).message).not.toContain('anna');
    }
  });
});

describe('htmlEmail', () => {
  it('keeps paragraphs and links, and escapes everything else', () => {
    const html = htmlEmail('Hej <Anna>!\n\nLänk: https://app.example/c/p1?x=1', 'sv');
    expect(html).toContain('<html lang="sv">');
    expect(html).toContain('Hej &#60;Anna&#62;!');
    expect(html).toContain('<a href="https://app.example/c/p1?x=1"');
    expect(html.match(/<p /g)).toHaveLength(2);
  });
});

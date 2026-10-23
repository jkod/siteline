import { createTransport, type Transporter } from 'nodemailer';

import type { EmailMessage, EmailSender, SendResult } from './types';

export class EmailProviderError extends Error {
  constructor(
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(`Email provider responded ${status}`);
    this.name = 'EmailProviderError';
  }
}

/**
 * Sends email over SMTP, so any provider with an EU data centre and a data processing agreement
 * works (PRD section 16): Brevo, Mailjet, Scaleway, Amazon SES and others. Configured by a URL
 * such as smtps://user:password@smtp.example.eu:465. Errors carry only the SMTP status.
 */
export class SmtpEmailSender implements EmailSender {
  private readonly transport: Transporter;

  constructor(
    private readonly config: { url: string; from: string },
    transport?: Transporter,
  ) {
    this.transport = transport ?? createTransport(config.url);
  }

  async send(message: EmailMessage): Promise<SendResult> {
    try {
      const info = await this.transport.sendMail({
        from: this.config.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      return { providerMessageId: String(info.messageId ?? '') };
    } catch (error) {
      const status = Number((error as { responseCode?: number }).responseCode ?? 0);
      // 4xx is temporary in SMTP; connection errors (no code) are worth retrying too.
      throw new EmailProviderError(status, status === 0 || (status >= 400 && status < 500));
    }
  }
}

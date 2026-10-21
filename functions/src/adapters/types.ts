import type { Locale } from '@siteline/shared';

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

export interface SpeechDrafter {
  /** Transcribes audio and rewrites it as a short update. Never receives names or numbers. */
  draft(audioPath: string, locale: Locale): Promise<SpeechDraft>;
}

export interface PdfRenderer {
  render(definition: unknown): Promise<Buffer>;
}

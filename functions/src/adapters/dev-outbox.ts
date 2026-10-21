import { FieldValue, type Firestore } from 'firebase-admin/firestore';

import type {
  EmailMessage,
  EmailSender,
  PushMessage,
  PushSender,
  SendResult,
  SmsMessage,
  SmsSender,
} from './types';

/** Collection the emulator senders write to; shown at /dev/outbox. Never used in production. */
export const DEV_OUTBOX = 'devOutbox';

type DevMessage =
  | ({ channel: 'sms' } & SmsMessage)
  | ({ channel: 'email' } & EmailMessage)
  | ({ channel: 'push' } & PushMessage);

async function write(db: Firestore, message: DevMessage): Promise<SendResult> {
  const ref = await db
    .collection(DEV_OUTBOX)
    .add({ ...message, createdAt: FieldValue.serverTimestamp() });
  return { providerMessageId: `dev-${ref.id}` };
}

export class DevSmsSender implements SmsSender {
  constructor(private readonly db: Firestore) {}
  send(message: SmsMessage): Promise<SendResult> {
    return write(this.db, { channel: 'sms', ...message });
  }
}

export class DevEmailSender implements EmailSender {
  constructor(private readonly db: Firestore) {}
  send(message: EmailMessage): Promise<SendResult> {
    return write(this.db, { channel: 'email', ...message });
  }
}

export class DevPushSender implements PushSender {
  constructor(private readonly db: Firestore) {}
  send(message: PushMessage): Promise<SendResult> {
    return write(this.db, { channel: 'push', ...message });
  }
}

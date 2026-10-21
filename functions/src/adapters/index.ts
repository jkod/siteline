import { db } from '../lib/admin';
import { isEmulator } from '../lib/env';
import { DevEmailSender, DevPushSender, DevSmsSender } from './dev-outbox';
import type { EmailSender, PushSender, SmsSender } from './types';

export type * from './types';

// Real providers (46elks, an EU email service, FCM) are added in M1 with their secrets.
function notConfigured(kind: string): never {
  throw new Error(`No ${kind} provider is configured outside the emulator yet`);
}

export function smsSender(): SmsSender {
  return isEmulator ? new DevSmsSender(db) : notConfigured('SMS');
}

export function emailSender(): EmailSender {
  return isEmulator ? new DevEmailSender(db) : notConfigured('email');
}

export function pushSender(): PushSender {
  return isEmulator ? new DevPushSender(db) : notConfigured('push');
}

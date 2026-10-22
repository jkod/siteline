import { db } from '../lib/admin';
import { elksPassword, elksUsername, isEmulator } from '../lib/env';
import { DevEmailSender, DevPushSender, DevSmsSender } from './dev-outbox';
import { DevSpeechDrafter } from './dev-speech';
import { ElksSmsSender } from './elks-sms';
import type { EmailSender, PushSender, SmsSender, SpeechDrafter } from './types';
import { VertexSpeechDrafter } from './vertex-speech';

export type * from './types';

// The email provider and web push arrive in later milestones.
function notConfigured(kind: string): never {
  throw new Error(`No ${kind} provider is configured outside the emulator yet`);
}

export function smsSender(): SmsSender {
  return isEmulator
    ? new DevSmsSender(db)
    : new ElksSmsSender({ username: elksUsername.value(), password: elksPassword.value() });
}

export function emailSender(): EmailSender {
  return isEmulator ? new DevEmailSender(db) : notConfigured('email');
}

export function pushSender(): PushSender {
  return isEmulator ? new DevPushSender(db) : notConfigured('push');
}

export function speechDrafter(): SpeechDrafter {
  return isEmulator ? new DevSpeechDrafter() : new VertexSpeechDrafter();
}

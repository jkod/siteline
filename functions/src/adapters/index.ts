import { getMessaging } from 'firebase-admin/messaging';

import { db } from '../lib/admin';
import {
  appUrl,
  elksPassword,
  elksUsername,
  emailFrom,
  isEmulator,
  smtpUrl,
  stripePrices,
  stripeSecretKey,
  stripeTaxRate,
  stripeWebhookSecret,
} from '../lib/env';
import { DevBillingProvider } from './dev-billing';
import { DevEmailSender, DevPushSender, DevSmsSender } from './dev-outbox';
import { DevSpeechDrafter } from './dev-speech';
import { ElksSmsSender } from './elks-sms';
import { FcmPushSender } from './fcm-push';
import { SmtpEmailSender } from './smtp-email';
import { StripeBillingProvider } from './stripe-billing';
import type { BillingProvider, EmailSender, PushSender, SmsSender, SpeechDrafter } from './types';
import { VertexSpeechDrafter } from './vertex-speech';

export type * from './types';

export function smsSender(): SmsSender {
  return isEmulator
    ? new DevSmsSender(db)
    : new ElksSmsSender({ username: elksUsername.value(), password: elksPassword.value() });
}

export function emailSender(): EmailSender {
  return isEmulator
    ? new DevEmailSender(db)
    : new SmtpEmailSender({ url: smtpUrl.value(), from: emailFrom.value() });
}

export function pushSender(): PushSender {
  return isEmulator ? new DevPushSender(db) : new FcmPushSender(getMessaging());
}

export function speechDrafter(): SpeechDrafter {
  return isEmulator ? new DevSpeechDrafter() : new VertexSpeechDrafter();
}

export function billingProvider(): BillingProvider {
  return isEmulator
    ? new DevBillingProvider(db, appUrl.value())
    : new StripeBillingProvider({
        secretKey: stripeSecretKey.value(),
        webhookSecret: stripeWebhookSecret.value(),
        prices: JSON.parse(stripePrices.value()) as Record<string, string>,
        taxRateId: stripeTaxRate.value(),
      });
}

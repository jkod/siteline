import { FieldValue, type Firestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/logger';
import type { OutboxMessage } from '@siteline/shared';

import type { EmailSender, SmsSender } from '../adapters/types';
import { appUrl } from './env';
import { render, smsSenderName, type TemplateName } from './templates';

export const MAX_ATTEMPTS = 3;

export interface Senders {
  sms: () => SmsSender;
  email: () => EmailSender;
}

/** Minutes to wait before attempt n + 1: 5, 20, 45. */
export function backoffMs(attempts: number): number {
  return attempts * attempts * 5 * 60_000;
}

/**
 * Sends one outbox message. A transaction claims it first (queued, or failed with attempts
 * left), so concurrent triggers and sweeps send it at most once. Logs only IDs and statuses,
 * never addresses or text (PRD section 13).
 */
export async function deliver(
  db: Firestore,
  id: string,
  senders: Senders,
  now = new Date(),
): Promise<void> {
  const ref = db.collection('outbox').doc(id);
  const message = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const data = snapshot.data() as OutboxMessage<Timestamp> | undefined;
    if (!data) return null;
    const due = data.sendAfter.toMillis() <= now.getTime();
    const retryable =
      data.status === 'failed' &&
      data.attempts < MAX_ATTEMPTS &&
      (data.nextAttemptAt?.toMillis() ?? 0) <= now.getTime();
    if (!due || (data.status !== 'queued' && !retryable)) return null;
    tx.update(ref, {
      status: 'sending',
      attempts: data.attempts + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ...data, attempts: data.attempts + 1 };
  });
  if (!message) return;

  try {
    const content = render(message.template as TemplateName, message.locale, {
      ...message.params,
      settingsLink: `${appUrl.value()}${message.params['settingsPath'] ?? '/app/settings/me'}`,
    });
    let providerMessageId: string;
    if (message.channel === 'sms') {
      if (!message.to.phone) throw new Error('missing_phone');
      ({ providerMessageId } = await senders.sms().send({
        to: message.to.phone,
        sender: smsSenderName(message.params['firm'] ?? ''),
        text: content.sms,
      }));
    } else if (message.channel === 'email') {
      if (!message.to.email) throw new Error('missing_email');
      ({ providerMessageId } = await senders.email().send({
        to: message.to.email,
        subject: content.subject,
        text: content.text,
      }));
    } else {
      // Web push arrives with device registration in a later milestone.
      await ref.update({
        status: 'suppressed',
        error: 'push_not_available',
        updatedAt: FieldValue.serverTimestamp(),
      });
      return;
    }
    await ref.update({
      status: 'sent',
      providerMessageId,
      error: null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    logger.info('outbox_sent', { id, channel: message.channel, template: message.template });
  } catch (error) {
    // Our own errors carry a code as the message; provider errors only a status in the name.
    const code = !(error instanceof Error)
      ? 'unknown'
      : error.name === 'Error'
        ? error.message
        : error.name;
    await ref.update({
      status: 'failed',
      error: code.slice(0, 100),
      nextAttemptAt: Timestamp.fromMillis(now.getTime() + backoffMs(message.attempts)),
      updatedAt: FieldValue.serverTimestamp(),
    });
    logger.warn('outbox_failed', {
      id,
      channel: message.channel,
      attempts: message.attempts,
      error: code,
    });
  }
}

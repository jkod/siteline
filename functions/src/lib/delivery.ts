import { FieldValue, type Firestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/logger';
import { type Company, effectiveLimits, type OutboxMessage, stockholmDate } from '@siteline/shared';

import type { EmailSender, SmsSender } from '../adapters/types';
import { appUrl } from './env';
import { render, smsSenderName, type TemplateName } from './templates';

export const MAX_ATTEMPTS = 3;

export interface Senders {
  sms: () => SmsSender;
  email: () => EmailSender;
}

/**
 * Counts one text message against the company's monthly budget (PRD section 6), resetting at the
 * start of each month. When it runs out, the owners are told once that month.
 */
export async function useSmsBudget(
  db: Firestore,
  companyId: string,
  now: Date,
): Promise<{ allowed: boolean }> {
  const ref = db.doc(`companies/${companyId}`);
  const month = stockholmDate(now).slice(0, 7);
  const result = await db.runTransaction(async (tx) => {
    const company = (await tx.get(ref)).data() as Company | undefined;
    if (!company) return { allowed: true, company };
    const used = company.usage.smsMonth === month ? company.usage.smsThisMonth : 0;
    const limit = effectiveLimits(company, now.getTime()).smsPerMonth;
    if (used >= limit) return { allowed: false, company };
    tx.update(ref, { 'usage.smsThisMonth': used + 1, 'usage.smsMonth': month });
    return { allowed: true, company };
  });
  if (!result.allowed && result.company) {
    const owners = await db
      .collection(`companies/${companyId}/staff`)
      .where('role', '==', 'owner')
      .get();
    const { queueMessage } = await import('./outbox');
    for (const owner of owners.docs) {
      const email = owner.get('email') as string | null;
      if (!email) continue;
      await queueMessage(
        db,
        {
          channel: 'email',
          to: { uid: owner.id, email },
          recipientKind: 'staff',
          template: 'smsBudgetReached',
          params: {
            firm: result.company.name,
            limit: String(effectiveLimits(result.company, now.getTime()).smsPerMonth),
            link: `${appUrl.value()}/app/settings/billing`,
          },
          locale: result.company.locale,
          companyId,
          projectId: null,
          dedupeKey: `smsBudget:${companyId}:${month}:${owner.id}`,
        },
        now,
      );
    }
  }
  return { allowed: result.allowed };
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

  // A "try Siteline" sandbox never reaches anyone.
  if (message.companyId && (await db.doc(`companies/${message.companyId}`).get()).get('demo')) {
    await ref.update({
      status: 'suppressed',
      error: 'demo',
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  try {
    if (message.channel === 'sms' && message.companyId) {
      const budget = await useSmsBudget(db, message.companyId, now);
      if (!budget.allowed) {
        if (message.to.email) {
          message.channel = 'email';
          await ref.update({ channel: 'email', error: 'sms_budget_fallback' });
        } else {
          await ref.update({
            status: 'suppressed',
            error: 'sms_budget',
            updatedAt: FieldValue.serverTimestamp(),
          });
          return;
        }
      }
    }
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

import { FieldValue, type Firestore, Timestamp } from 'firebase-admin/firestore';
import {
  clientSendTime,
  type Locale,
  type NotifyChannel,
  type OutboxMessage,
} from '@siteline/shared';

import { sha256Hex } from './crypto';
import type { TemplateName } from './templates';

export interface QueueInput {
  channel: NotifyChannel;
  to: { uid: string | null; phone?: string | null; email?: string | null };
  /** Clients get quiet hours for text and push; staff set their own (later milestone). */
  recipientKind: 'client' | 'staff';
  template: TemplateName;
  params: Record<string, string>;
  locale: Locale;
  companyId: string | null;
  projectId: string | null;
  /** The same key never sends twice (PRD F8). */
  dedupeKey: string;
}

/**
 * Queues a message in the outbox. The document ID is derived from the dedupe key, so a retried
 * trigger or callable can't queue the same message twice. Returns false when it already exists.
 */
export async function queueMessage(
  db: Firestore,
  input: QueueInput,
  now = new Date(),
): Promise<boolean> {
  // QUIET_HOURS=off is set only for the end-to-end test project, so tests don't depend on the
  // time of day; integration tests cover quiet hours with a fixed clock.
  const quiet =
    input.recipientKind === 'client' &&
    input.channel !== 'email' &&
    process.env['QUIET_HOURS'] !== 'off';
  const sendAfter = quiet ? clientSendTime(now) : now;
  const message: OutboxMessage<Timestamp | FieldValue> = {
    channel: input.channel,
    to: { uid: input.to.uid, phone: input.to.phone ?? null, email: input.to.email ?? null },
    template: input.template,
    params: input.params,
    locale: input.locale,
    companyId: input.companyId,
    projectId: input.projectId,
    dedupeKey: input.dedupeKey,
    sendAfter: Timestamp.fromDate(sendAfter),
    status: 'queued',
    attempts: 0,
    nextAttemptAt: null,
    providerMessageId: null,
    error: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  try {
    await db.collection('outbox').doc(sha256Hex(input.dedupeKey)).create(message);
    return true;
  } catch (error) {
    if ((error as { code?: number }).code === 6) return false; // ALREADY_EXISTS
    throw error;
  }
}

export const BATCH_WINDOW_MS = 10 * 60_000;

/**
 * Several events for the same person and project within 10 minutes become one message (PRD
 * section 6). The first goes out as usual; later ones in the window are counted into a single
 * follow-up that sends when the window ends. Decisions always notify on their own, so they
 * don't use this.
 */
export async function queueBatched(
  db: Firestore,
  input: QueueInput,
  now = new Date(),
): Promise<void> {
  const window = Math.floor(now.getTime() / BATCH_WINDOW_MS);
  const key = `batch:${input.channel}:${input.to.uid}:${input.projectId}:${window}`;
  const counter = db.collection('outboxBatches').doc(sha256Hex(key));
  const first = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(counter);
    const count = (snapshot.get('count') as number | undefined) ?? 0;
    tx.set(counter, {
      count: count + 1,
      expiresAt: Timestamp.fromMillis((window + 2) * BATCH_WINDOW_MS),
    });
    if (count > 0) {
      // A follow-up for everything after the first event, sent at the end of the window.
      const followUp: Partial<OutboxMessage<Timestamp | FieldValue>> = {
        channel: input.channel,
        to: { uid: input.to.uid, phone: input.to.phone ?? null, email: input.to.email ?? null },
        template: 'activity',
        params: { ...input.params, count: String(count) },
        locale: input.locale,
        companyId: input.companyId,
        projectId: input.projectId,
        dedupeKey: `${key}:followup`,
        sendAfter: Timestamp.fromMillis((window + 1) * BATCH_WINDOW_MS),
        status: 'queued',
        attempts: 0,
        nextAttemptAt: null,
        providerMessageId: null,
        error: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      tx.set(db.collection('outbox').doc(sha256Hex(`${key}:followup`)), followUp);
    }
    return count === 0;
  });
  if (first) await queueMessage(db, input, now);
}

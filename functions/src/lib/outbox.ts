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
  const quiet = input.recipientKind === 'client' && input.channel !== 'email';
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

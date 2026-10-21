import { type Firestore, Timestamp } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/scheduler';
import { TIME_ZONE } from '@siteline/shared';

import { db } from '../lib/admin';
import { deliver, MAX_ATTEMPTS, type Senders } from '../lib/delivery';
import { messagingSecrets } from '../lib/env';
import { senders } from '../triggers/outbox';

/** A message stuck in "sending" this long is treated as failed and retried. */
const STALE_SENDING_MS = 10 * 60_000;

/**
 * Sends messages whose sendAfter has passed (held by quiet hours) and retries failures up to
 * three times with backoff (PRD section 9).
 */
export async function sweepOutbox(
  firestore: Firestore,
  using: Senders,
  now = new Date(),
): Promise<number> {
  const nowTs = Timestamp.fromDate(now);
  const due = await firestore
    .collection('outbox')
    .where('status', '==', 'queued')
    .where('sendAfter', '<=', nowTs)
    .limit(200)
    .get();
  const retries = await firestore
    .collection('outbox')
    .where('status', '==', 'failed')
    .where('nextAttemptAt', '<=', nowTs)
    .limit(200)
    .get();
  const stale = await firestore
    .collection('outbox')
    .where('status', '==', 'sending')
    .where('updatedAt', '<=', Timestamp.fromMillis(now.getTime() - STALE_SENDING_MS))
    .limit(50)
    .get();
  for (const doc of stale.docs) await doc.ref.update({ status: 'failed', nextAttemptAt: nowTs });

  const ids = [
    ...due.docs.map((d) => d.id),
    ...retries.docs.filter((d) => (d.get('attempts') as number) < MAX_ATTEMPTS).map((d) => d.id),
    ...stale.docs.map((d) => d.id),
  ];
  for (const id of ids) await deliver(firestore, id, using, now);
  return ids.length;
}

export const outboxSweeper = onSchedule(
  { schedule: 'every 5 minutes', timeZone: TIME_ZONE, secrets: messagingSecrets },
  async () => {
    await sweepOutbox(db, senders);
  },
);

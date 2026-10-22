import { type Firestore, Timestamp } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/scheduler';
import {
  type DailyMetrics,
  type MetricEvent,
  stockholmDate,
  stockholmDayRange,
  TIME_ZONE,
  type VoiceDraft,
} from '@siteline/shared';

import { bucket, db } from '../lib/admin';

/** Deletes voice recordings whose time is up: 30 days after their post, or a day unused (F5). */
export async function purgeVoiceAudio(firestore: Firestore, now = new Date()): Promise<number> {
  let deleted = 0;
  for (;;) {
    const due = await firestore
      .collectionGroup('voice')
      .where('deleteAfter', '<=', Timestamp.fromDate(now))
      .limit(200)
      .get();
    if (due.empty) return deleted;
    for (const doc of due.docs) {
      const voice = doc.data() as VoiceDraft;
      await bucket().file(voice.path).delete({ ignoreNotFound: true });
      await doc.ref.delete();
      deleted++;
    }
  }
}

/**
 * Rolls yesterday's events (Stockholm time) into one document of counts per company (PRD
 * section 9). Rerunning a day rewrites the same documents.
 */
export async function aggregateMetrics(firestore: Firestore, now = new Date()): Promise<number> {
  const date = stockholmDate(new Date(now.getTime() - 86_400_000));
  const { start, end } = stockholmDayRange(date);
  const events = await firestore
    .collection('events')
    .where('at', '>=', Timestamp.fromDate(start))
    .where('at', '<', Timestamp.fromDate(end))
    .get();
  const byCompany = new Map<string | null, DailyMetrics['counts']>();
  for (const doc of events.docs) {
    const { companyId, name } = doc.data() as MetricEvent;
    const counts = byCompany.get(companyId) ?? {};
    counts[name] = (counts[name] ?? 0) + 1;
    byCompany.set(companyId, counts);
  }
  const batch = firestore.batch();
  for (const [companyId, counts] of byCompany) {
    const metrics: DailyMetrics = { companyId, date, counts };
    batch.set(firestore.doc(`metrics/${companyId ?? '_none'}_${date}`), metrics);
  }
  await batch.commit();
  return byCompany.size;
}

export const purgeVoiceAudioJob = onSchedule(
  { schedule: 'every day 03:30', timeZone: TIME_ZONE },
  async () => {
    await purgeVoiceAudio(db);
  },
);

export const aggregateMetricsJob = onSchedule(
  { schedule: 'every day 01:00', timeZone: TIME_ZONE },
  async () => {
    await aggregateMetrics(db);
  },
);

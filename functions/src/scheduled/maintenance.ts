import { type Firestore, Timestamp } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/scheduler';
import {
  type Company,
  type DailyMetrics,
  type MetricEvent,
  type Project,
  type ProjectMember,
  type Reminder,
  stockholmDate,
  stockholmDayRange,
  TIME_ZONE,
  type UserDoc,
  type VoiceDraft,
} from '@siteline/shared';

import { nextSendAt } from '../callables/handover';
import { auth, bucket, db } from '../lib/admin';
import { deleteDemo, type DemoRecord } from '../lib/demo';
import { appUrl } from '../lib/env';
import { queueMessage } from '../lib/outbox';
import { purgeDeletedProjects } from '../lib/privacy';
import { syncBranding } from '../triggers/company';

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

/**
 * Design partners whose free period ended in the last day go back to their own plan's branding
 * (limits follow compedUntil on their own, through effectiveLimits).
 */
export async function syncEndedComps(firestore: Firestore, now = new Date()): Promise<number> {
  const ended = await firestore
    .collection('companies')
    .where('compedUntil', '>', Timestamp.fromMillis(now.getTime() - 86_400_000))
    .where('compedUntil', '<=', Timestamp.fromDate(now))
    .get();
  for (const doc of ended.docs) await syncBranding(firestore, doc.id, doc.data() as Company, now);
  return ended.size;
}

/** Deletes "try Siteline" sandboxes whose few days are up. */
export async function purgeDemos(firestore: Firestore, now = new Date()): Promise<number> {
  const due = await firestore
    .collection('demos')
    .where('expiresAt', '<=', Timestamp.fromDate(now))
    .limit(50)
    .get();
  for (const doc of due.docs) {
    await deleteDemo(firestore, doc.data() as DemoRecord, (uids) => auth.deleteUsers(uids));
  }
  return due.size;
}

export const purgeDemosJob = onSchedule(
  { schedule: 'every day 04:00', timeZone: TIME_ZONE },
  async () => {
    await purgeDemos(db);
    await syncEndedComps(db);
    await purgeDeletedProjects(db);
  },
);

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

/**
 * Aftercare reminders due today go to the project's clients at 09:00 (PRD F13), on their own
 * channel, unless they turned reminders off. Yearly ones move to next year; others end.
 */
export async function sendAftercareReminders(
  firestore: Firestore,
  now = new Date(),
): Promise<number> {
  const due = await firestore
    .collectionGroup('reminders')
    .where('active', '==', true)
    .where('nextSendAt', '<=', Timestamp.fromDate(now))
    .get();
  let sent = 0;
  for (const doc of due.docs) {
    const reminder = doc.data() as Reminder<Timestamp>;
    const projectId = doc.ref.parent.parent!.id;
    const project = (await firestore.doc(`projects/${projectId}`).get()).data() as
      Project | undefined;
    if (project) {
      for (const uid of project.clientUids) {
        const member = (
          await firestore.doc(`projects/${projectId}/members/${uid}`).get()
        ).data() as ProjectMember | undefined;
        if (member?.notify?.aftercare === false) continue;
        const user = (await firestore.doc(`users/${uid}`).get()).data() as UserDoc | undefined;
        const channel =
          member?.notify?.channel === 'email' && user?.email
            ? 'email'
            : user?.phoneE164
              ? 'sms'
              : user?.email
                ? 'email'
                : null;
        if (!user || !channel) continue;
        const queued = await queueMessage(
          firestore,
          {
            channel,
            to: { uid, phone: user.phoneE164, email: user.email },
            recipientKind: 'client',
            template: 'aftercareReminder',
            params: {
              firm: project.branding.name,
              title: reminder.title,
              note: reminder.note,
              link: `${appUrl.value()}/c/${projectId}/handover?book=${doc.id}`,
              settingsPath: '/c/settings',
            },
            locale: user.locale,
            companyId: project.companyId,
            projectId,
            dedupeKey: `aftercare:${doc.id}:${reminder.nextSendAt.toMillis()}:${uid}`,
          },
          now,
        );
        if (queued) sent++;
      }
    }
    const next = reminder.repeat === 'yearly' ? nextSendAt(reminder.dueDate, 'yearly', now) : null;
    await doc.ref.update(next ? { nextSendAt: Timestamp.fromDate(next) } : { active: false });
  }
  return sent;
}

export const sendAftercareRemindersJob = onSchedule(
  { schedule: 'every day 09:00', timeZone: TIME_ZONE },
  async () => {
    await sendAftercareReminders(db);
  },
);

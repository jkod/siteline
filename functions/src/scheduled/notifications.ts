import { type Firestore, Timestamp } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/scheduler';
import {
  type ChecklistItem,
  type Company,
  type Post,
  type Project,
  type ProjectMember,
  stockholmDate,
  stockholmDayRange,
  TIME_ZONE,
  type UserDoc,
  type Visit,
  zonedParts,
} from '@siteline/shared';

import { db } from '../lib/admin';
import { appUrl } from '../lib/env';
import { digestSummary, timeOf } from '../lib/format';
import { queueMessage } from '../lib/outbox';
import { projectStaff } from '../lib/recipients';
import { generateVisitsForProject } from '../lib/visits';

/** The half-hour slot a Stockholm time falls in, as HH:MM: 18:14 → "18:00", 18:44 → "18:30". */
export function halfHourSlot(now: Date): string {
  const p = zonedParts(now);
  return `${String(p.hour).padStart(2, '0')}:${p.minute < 30 ? '00' : '30'}`;
}

async function companiesAt(
  firestore: Firestore,
  field: 'digestTime' | 'reminderTime',
  slot: string,
) {
  const snapshot = await firestore
    .collection('companies')
    .where(`settings.${field}`, '==', slot)
    .get();
  return snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Company) }));
}

/**
 * The daily digest (PRD F8): for companies whose digest time is now, each active project that
 * had new updates today gets one message per client, unless they turned the digest off or get
 * updates instantly. Service clients get each report straight away instead.
 */
export async function sendDigests(firestore: Firestore, now = new Date()): Promise<number> {
  const today = stockholmDate(now);
  const { start } = stockholmDayRange(today);
  let queued = 0;
  for (const company of await companiesAt(firestore, 'digestTime', halfHourSlot(now))) {
    const projects = await firestore
      .collection('projects')
      .where('companyId', '==', company.id)
      .where('status', '==', 'active')
      .get();
    for (const projectDoc of projects.docs) {
      const project = projectDoc.data() as Project;
      if (project.kind !== 'project') continue;
      const posts = await projectDoc.ref
        .collection('posts')
        .where('createdAt', '>=', Timestamp.fromDate(start))
        .get();
      const today = posts.docs
        .map((d) => d.data() as Post)
        .filter(
          (p) =>
            p.visibility === 'all' &&
            !p.deletedAt &&
            (p.type === 'update' || p.type === 'milestone'),
        );
      if (today.length === 0) continue;
      const photos = today.reduce((sum, p) => sum + p.media.length, 0);

      for (const uid of project.clientUids) {
        const member = (await projectDoc.ref.collection('members').doc(uid).get()).data() as
          ProjectMember | undefined;
        if (member?.notify?.digest === false || member?.notify?.instant) continue;
        const user = (await firestore.doc(`users/${uid}`).get()).data() as UserDoc | undefined;
        if (!user) continue;
        const channel =
          member?.notify?.channel === 'email' && user.email
            ? 'email'
            : user.phoneE164
              ? 'sms'
              : user.email
                ? 'email'
                : null;
        if (!channel) continue;
        const added = await queueMessage(
          firestore,
          {
            channel,
            to: { uid, phone: user.phoneE164, email: user.email },
            recipientKind: 'client',
            template: 'digest',
            params: {
              project: project.title,
              firm: project.branding.name,
              summary: digestSummary(today.length, photos, user.locale),
              link: `${appUrl.value()}/c/${projectDoc.id}`,
              inviteLink: `${appUrl.value()}/c?invite=1`,
              settingsPath: '/c/settings',
            },
            locale: user.locale,
            companyId: company.id,
            projectId: projectDoc.id,
            dedupeKey: `digest:${projectDoc.id}:${uid}:${today}`,
          },
          now,
        );
        if (added) queued++;
      }
    }
  }
  return queued;
}

/**
 * The evening-before reminder (PRD F7): for companies whose reminder time is now, each visit
 * booked for tomorrow reminds the clients of their open items and the assigned crew of the
 * firm's. Only the recipient's side is listed.
 */
export async function sendVisitReminders(firestore: Firestore, now = new Date()): Promise<number> {
  const tomorrow = stockholmDate(new Date(now.getTime() + 86_400_000));
  const { start, end } = stockholmDayRange(tomorrow);
  let queued = 0;
  for (const company of await companiesAt(firestore, 'reminderTime', halfHourSlot(now))) {
    const visits = await firestore
      .collectionGroup('visits')
      .where('companyId', '==', company.id)
      .where('status', '==', 'planned')
      .where('startAt', '>=', Timestamp.fromDate(start))
      .where('startAt', '<', Timestamp.fromDate(end))
      .get();
    for (const visitDoc of visits.docs) {
      const visit = visitDoc.data() as Visit<Timestamp>;
      const projectRef = visitDoc.ref.parent.parent!;
      const project = (await projectRef.get()).data() as Project | undefined;
      if (!project || project.status !== 'active') continue;
      const open = (
        await projectRef.collection('checklist').where('visitId', '==', visitDoc.id).get()
      ).docs
        .map((d) => d.data() as ChecklistItem)
        .filter((i) => !i.doneAt);
      const list = (side: 'client' | 'firm') =>
        open
          .filter((i) => i.side === side)
          .map((i) => i.text)
          .join(', ');
      const time = timeOf(visit.startAt.toDate());

      for (const uid of project.clientUids) {
        const user = (await firestore.doc(`users/${uid}`).get()).data() as UserDoc | undefined;
        if (!user?.phoneE164 && !user?.email) continue;
        if (
          await queueMessage(
            firestore,
            {
              channel: user.phoneE164 ? 'sms' : 'email',
              to: { uid, phone: user.phoneE164, email: user.email },
              recipientKind: 'client',
              template: 'visitReminderClient',
              params: {
                firm: project.branding.name,
                time,
                items: list('client'),
                link: `${appUrl.value()}/c/${projectRef.id}/visit`,
                settingsPath: '/c/settings',
              },
              locale: user.locale,
              companyId: company.id,
              projectId: projectRef.id,
              dedupeKey: `reminder:${projectRef.id}:${visitDoc.id}:${uid}:${tomorrow}`,
            },
            now,
          )
        )
          queued++;
      }
      for (const staff of await projectStaff(firestore, project)) {
        if (staff.role !== 'crew' || !staff.email) continue;
        if (
          await queueMessage(
            firestore,
            {
              channel: 'email',
              to: { uid: staff.uid, email: staff.email },
              recipientKind: 'staff',
              template: 'visitReminderStaff',
              params: {
                project: project.title,
                time,
                items: list('firm'),
                link: `${appUrl.value()}/app/projects/${projectRef.id}/visit`,
              },
              locale: staff.locale,
              companyId: company.id,
              projectId: projectRef.id,
              dedupeKey: `reminder:${projectRef.id}:${visitDoc.id}:${staff.uid}:${tomorrow}`,
            },
            now,
          )
        )
          queued++;
      }
    }
  }
  return queued;
}

/** Keeps every active service client's visits created eight weeks ahead (PRD F19). */
export async function generateAllVisits(firestore: Firestore, now = new Date()): Promise<number> {
  const services = await firestore
    .collection('projects')
    .where('kind', '==', 'service')
    .where('status', '==', 'active')
    .get();
  let created = 0;
  for (const doc of services.docs)
    created += await generateVisitsForProject(firestore, doc.id, doc.data() as Project, now);
  return created;
}

export const sendDigestsJob = onSchedule(
  { schedule: 'every 30 minutes', timeZone: TIME_ZONE },
  async () => {
    await sendDigests(db);
  },
);

export const sendVisitRemindersJob = onSchedule(
  { schedule: 'every 30 minutes', timeZone: TIME_ZONE },
  async () => {
    await sendVisitReminders(db);
  },
);

export const generateVisitsJob = onSchedule(
  { schedule: 'every day 03:00', timeZone: TIME_ZONE },
  async () => {
    await generateAllVisits(db);
  },
);

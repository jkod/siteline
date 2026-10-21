import { type DocumentSnapshot, type Firestore, Timestamp } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/firestore';
import type { Post, Project, ProjectMember, UserDoc, Visit } from '@siteline/shared';

import { db } from '../lib/admin';
import { appUrl } from '../lib/env';
import { dayOf } from '../lib/format';
import { queueBatched, queueMessage } from '../lib/outbox';
import { projectStaff } from '../lib/recipients';

/**
 * Recounts the project's unanswered questions. Counting instead of incrementing keeps the total
 * right when a trigger runs twice.
 */
export async function recountUnanswered(firestore: Firestore, projectId: string): Promise<void> {
  const unanswered = await firestore
    .collection(`projects/${projectId}/posts`)
    .where('type', '==', 'question')
    .where('unanswered', '==', true)
    .count()
    .get();
  await firestore.doc(`projects/${projectId}`).update({
    'totals.unansweredQuestions': unanswered.data().count,
  });
}

/** Moves lastPostAt forward only, so a replayed older event can't move it back. */
async function bumpLastPostAt(
  firestore: Firestore,
  projectId: string,
  createdAt: Timestamp,
): Promise<void> {
  const ref = firestore.doc(`projects/${projectId}`);
  await firestore.runTransaction(async (tx) => {
    const current = (await tx.get(ref)).get('lastPostAt') as Timestamp | null | undefined;
    if (!current || current.toMillis() < createdAt.toMillis())
      tx.update(ref, { lastPostAt: createdAt });
  });
}

/** Tells the project's staff about a client's question straight away (PRD section 6). */
async function notifyQuestion(
  firestore: Firestore,
  projectId: string,
  postId: string,
  post: Post,
): Promise<void> {
  const project = (await firestore.doc(`projects/${projectId}`).get()).data() as
    Project | undefined;
  if (!project) return;
  for (const staff of await projectStaff(firestore, project)) {
    if (!staff.email || !staff.wantsEmail) continue;
    await queueBatched(firestore, {
      channel: 'email',
      to: { uid: staff.uid, email: staff.email },
      recipientKind: 'staff',
      template: 'clientQuestion',
      params: {
        client: post.authorName,
        project: project.title,
        link: `${appUrl.value()}/app/projects/${projectId}?post=${postId}`,
      },
      locale: staff.locale,
      companyId: project.companyId,
      projectId,
      dedupeKey: `question:${postId}:${staff.uid}`,
    });
  }
}

/** Each client on the project, with their user and member settings. */
async function clientsOf(firestore: Firestore, projectId: string, project: Project) {
  return Promise.all(
    project.clientUids.map(async (uid) => ({
      uid,
      user: (await firestore.doc(`users/${uid}`).get()).data() as UserDoc | undefined,
      member: (await firestore.doc(`projects/${projectId}/members/${uid}`).get()).data() as
        ProjectMember | undefined,
    })),
  );
}

/** The channel a client gets messages on: their choice, or text, or email (push comes later). */
function channelFor(user: UserDoc, member: ProjectMember | undefined): 'sms' | 'email' | null {
  const preferred = member?.notify?.channel;
  if (preferred === 'email' && user.email) return 'email';
  if (user.phoneE164) return 'sms';
  return user.email ? 'email' : null;
}

/**
 * Service clients get each visit report straight away (PRD section 6); clients who turned on
 * instant updates get ordinary updates straight away too, batched, instead of in the digest.
 */
async function notifyClientsOfPost(
  firestore: Firestore,
  projectId: string,
  postId: string,
  post: Post,
): Promise<void> {
  const project = (await firestore.doc(`projects/${projectId}`).get()).data() as
    Project | undefined;
  if (!project) return;
  const isReport = post.type === 'visit_report';
  let reportDate = '';
  for (const { uid, user, member } of await clientsOf(firestore, projectId, project)) {
    if (!user) continue;
    if (!isReport && !member?.notify?.instant) continue;
    const channel = channelFor(user, member);
    if (!channel) continue;
    if (isReport && !reportDate) {
      const visit = (
        await firestore.doc(`projects/${projectId}/visits/${post.report!.visitId}`).get()
      ).data() as Visit<Timestamp> | undefined;
      reportDate = dayOf((visit?.startAt ?? Timestamp.now()).toDate(), user.locale);
    }
    const input = {
      channel,
      to: { uid, phone: user.phoneE164, email: user.email },
      recipientKind: 'client' as const,
      template: isReport ? ('visitReport' as const) : ('newUpdate' as const),
      params: {
        firm: project.branding.name,
        project: project.title,
        date: reportDate,
        link: `${appUrl.value()}/c/${projectId}?post=${postId}`,
        settingsPath: '/c/settings',
      },
      locale: user.locale,
      companyId: project.companyId,
      projectId,
      dedupeKey: `post:${postId}:${uid}`,
    };
    if (isReport) await queueMessage(firestore, input);
    else await queueBatched(firestore, input);
  }
}

export async function handlePostWritten(
  firestore: Firestore,
  projectId: string,
  postId: string,
  before: DocumentSnapshot | undefined,
  after: DocumentSnapshot | undefined,
): Promise<void> {
  const previous = before?.exists ? (before.data() as Post) : null;
  const current = after?.exists ? (after.data() as Post) : null;

  if (current && !previous) {
    const createdAt = current.createdAt instanceof Timestamp ? current.createdAt : Timestamp.now();
    await bumpLastPostAt(firestore, projectId, createdAt);
    if (current.type === 'question') await notifyQuestion(firestore, projectId, postId, current);
    if (
      current.visibility === 'all' &&
      ['update', 'milestone', 'visit_report'].includes(current.type)
    ) {
      await notifyClientsOfPost(firestore, projectId, postId, current);
    }
  }
  if (previous?.type === 'question' || current?.type === 'question') {
    if (previous?.unanswered !== current?.unanswered || !previous || !current) {
      await recountUnanswered(firestore, projectId);
    }
  }
}

/** Keeps project counters and lastPostAt current and notifies staff of questions (PRD 9). */
export const onPostWritten = onDocumentWritten('projects/{projectId}/posts/{postId}', (event) =>
  handlePostWritten(
    db,
    event.params.projectId,
    event.params.postId,
    event.data?.before,
    event.data?.after,
  ),
);

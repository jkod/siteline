import { type DocumentSnapshot, type Firestore, Timestamp } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/firestore';
import type { Post, Project } from '@siteline/shared';

import { db } from '../lib/admin';
import { appUrl } from '../lib/env';
import { queueMessage } from '../lib/outbox';
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
    await queueMessage(firestore, {
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

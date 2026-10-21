import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/firestore';
import { type Comment, isStaffRole, type Post, type Project, type UserDoc } from '@siteline/shared';

import { db } from '../lib/admin';
import { appUrl } from '../lib/env';
import { queueMessage } from '../lib/outbox';
import { projectStaff } from '../lib/recipients';
import { recountUnanswered } from './posts';

const TWO_HOURS = 2 * 60 * 60_000;

async function recountComments(
  firestore: Firestore,
  projectId: string,
  postId: string,
): Promise<void> {
  const postRef = firestore.doc(`projects/${projectId}/posts/${postId}`);
  const count = await postRef.collection('comments').where('deletedAt', '==', null).count().get();
  await postRef.update({ commentCount: count.data().count });
}

async function notifyStaff(
  firestore: Firestore,
  ids: { projectId: string; postId: string; commentId: string },
  project: Project,
  comment: Comment,
): Promise<void> {
  for (const staff of await projectStaff(firestore, project)) {
    if (!staff.email || !staff.wantsEmail) continue;
    await queueMessage(firestore, {
      channel: 'email',
      to: { uid: staff.uid, email: staff.email },
      recipientKind: 'staff',
      template: 'clientComment',
      params: {
        client: comment.authorName,
        project: project.title,
        link: `${appUrl.value()}/app/projects/${ids.projectId}?post=${ids.postId}`,
      },
      locale: staff.locale,
      companyId: project.companyId,
      projectId: ids.projectId,
      dedupeKey: `comment:${ids.commentId}:${staff.uid}`,
    });
  }
}

/**
 * Texts the client whose question or post staff replied to: at most one text per project every
 * two hours (PRD section 6). The dedupe key carries the two-hour window.
 */
async function notifyClient(
  firestore: Firestore,
  ids: { projectId: string; postId: string },
  project: Project,
  clientUid: string,
  nowMs: number,
): Promise<void> {
  if (!project.clientUids.includes(clientUid)) return;
  const user = (await firestore.doc(`users/${clientUid}`).get()).data() as UserDoc | undefined;
  if (!user?.phoneE164) return;
  await queueMessage(firestore, {
    channel: 'sms',
    to: { uid: clientUid, phone: user.phoneE164, email: user.email },
    recipientKind: 'client',
    template: 'staffReply',
    params: {
      firm: project.branding.name,
      project: project.title,
      link: `${appUrl.value()}/c/${ids.projectId}?post=${ids.postId}`,
      settingsPath: '/c/settings',
    },
    locale: user.locale,
    companyId: project.companyId,
    projectId: ids.projectId,
    dedupeKey: `reply:${ids.projectId}:${clientUid}:${Math.floor(nowMs / TWO_HOURS)}`,
  });
}

export async function handleCommentWritten(
  firestore: Firestore,
  ids: { projectId: string; postId: string; commentId: string },
  before: DocumentSnapshot | undefined,
  after: DocumentSnapshot | undefined,
  nowMs = Date.now(),
): Promise<void> {
  await recountComments(firestore, ids.projectId, ids.postId);
  const created = after?.exists && !before?.exists ? (after.data() as Comment) : null;
  if (!created) return;

  const postRef = firestore.doc(`projects/${ids.projectId}/posts/${ids.postId}`);
  const post = (await postRef.get()).data() as Post | undefined;
  const project = (await firestore.doc(`projects/${ids.projectId}`).get()).data() as
    Project | undefined;
  if (!post || !project) return;

  if (isStaffRole(created.authorRole)) {
    // A staff reply answers a client's question (PRD F4).
    if (post.type === 'question' && post.unanswered) {
      await postRef.update({ unanswered: false });
      await recountUnanswered(firestore, ids.projectId);
    }
    if (post.authorRole === 'client')
      await notifyClient(firestore, ids, project, post.authorUid, nowMs);
  } else if (created.authorRole === 'client') {
    await notifyStaff(firestore, ids, project, created);
  }
}

/** Keeps comment counts current, clears unanswered on staff replies and notifies (PRD 9). */
export const onCommentWritten = onDocumentWritten(
  'projects/{projectId}/posts/{postId}/comments/{commentId}',
  (event) => handleCommentWritten(db, event.params, event.data?.before, event.data?.after),
);

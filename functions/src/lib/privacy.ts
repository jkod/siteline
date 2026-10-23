import { FieldValue, type Firestore, Timestamp } from 'firebase-admin/firestore';
import type { Decision, Locale, Project } from '@siteline/shared';

import { bucket } from './admin';
import { revokeClientInvites } from './invites';

/** Kept for 30 days after deletion, then purged with all files (PRD F11, section 10). */
export const DELETED_PROJECT_DAYS = 30;

export const FORMER: Record<'client' | 'staff', Record<Locale, string>> = {
  client: { sv: 'Tidigare kund', en: 'Former client' },
  staff: { sv: 'Tidigare medarbetare', en: 'Former staff member' },
};

/** "Anna Lindqvist" → "A. L.": what approval evidence keeps of a removed person (PRD F11). */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part[0]!.toLocaleUpperCase('sv')}.`)
    .join(' ');
}

/**
 * Removes a person's name from one project (PRD F11). Their posts and comments show a
 * neutral name, checklist items lose it, and decisions and approval records keep only their
 * initials and masked number as evidence of what was agreed.
 */
export async function anonymiseInProject(
  db: Firestore,
  projectId: string,
  uid: string,
  name: string,
  replacement: string,
): Promise<void> {
  const project = db.doc(`projects/${projectId}`);
  const short = initials(name);
  const writes: [FirebaseFirestore.DocumentReference, Record<string, unknown>][] = [];

  const posts = await project.collection('posts').get();
  for (const post of posts.docs) {
    const data = post.data() as { authorUid: string; decision?: Decision | null };
    const update: Record<string, unknown> = {};
    if (data.authorUid === uid) update['authorName'] = replacement;
    const d = data.decision;
    if (d?.decidedByName?.includes(name))
      update['decision.decidedByName'] = d.decidedByName.replace(name, short);
    if (d?.approvals?.some((a) => a.uid === uid)) {
      update['decision.approvals'] = d.approvals.map((a) =>
        a.uid === uid ? { ...a, name: short } : a,
      );
    }
    if (Object.keys(update).length) writes.push([post.ref, update]);
    const comments = await post.ref.collection('comments').where('authorUid', '==', uid).get();
    for (const comment of comments.docs) writes.push([comment.ref, { authorName: replacement }]);
  }
  const approvals = await project.collection('approvals').where('actorUid', '==', uid).get();
  for (const approval of approvals.docs) writes.push([approval.ref, { actorName: short }]);
  const created = await project.collection('checklist').where('createdBy', '==', uid).get();
  for (const item of created.docs) writes.push([item.ref, { createdByName: replacement }]);
  const done = await project.collection('checklist').where('doneBy', '==', uid).get();
  for (const item of done.docs) writes.push([item.ref, { doneByName: replacement }]);

  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    for (const [ref, data] of writes.slice(i, i + 400)) batch.update(ref, data);
    await batch.commit();
  }
}

/** A client leaves a project: no more access, links revoked, and their name taken out of it. */
export async function leave(
  db: Firestore,
  projectId: string,
  uid: string,
  name: string,
  locale: Locale,
): Promise<void> {
  await revokeClientInvites(db, projectId, uid);
  const project = db.doc(`projects/${projectId}`);
  const batch = db.batch();
  batch.update(project, {
    clientUids: FieldValue.arrayRemove(uid),
    [`roles.${uid}`]: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.delete(project.collection('members').doc(uid));
  await batch.commit();
  await anonymiseInProject(db, projectId, uid, name, FORMER.client[locale]);
}

/**
 * Deletes a project for everyone at once (PRD F11): the document moves to deletedProjects and
 * nobody can open it any more. Its posts, approvals and files stay until the nightly purge, 30
 * days later, in case the deletion was a mistake that support can undo.
 */
export async function softDeleteProject(
  db: Firestore,
  projectId: string,
  project: Project,
  deletedBy: string,
  now = new Date(),
): Promise<void> {
  for (const uid of project.clientUids) await revokeClientInvites(db, projectId, uid);
  const ref = db.doc(`projects/${projectId}`);
  await db.runTransaction(async (tx) => {
    tx.set(db.doc(`deletedProjects/${projectId}`), {
      ...project,
      deletedBy,
      deletedAt: Timestamp.fromDate(now),
      purgeAfter: Timestamp.fromMillis(now.getTime() + DELETED_PROJECT_DAYS * 86_400_000),
    });
    tx.delete(ref);
    if (project.status === 'active') {
      const key = project.kind === 'service' ? 'serviceClients' : 'activeProjects';
      tx.update(db.doc(`companies/${project.companyId}`), {
        [`usage.${key}`]: FieldValue.increment(-1),
      });
    }
  });
}

/** Removes every trace of projects deleted more than 30 days ago: documents and files. */
export async function purgeDeletedProjects(db: Firestore, now = new Date()): Promise<number> {
  const due = await db
    .collection('deletedProjects')
    .where('purgeAfter', '<=', Timestamp.fromDate(now))
    .limit(50)
    .get();
  for (const doc of due.docs) {
    await db.recursiveDelete(db.doc(`projects/${doc.id}`));
    await bucket().deleteFiles({ prefix: `projects/${doc.id}/` });
    await doc.ref.delete();
  }
  return due.size;
}

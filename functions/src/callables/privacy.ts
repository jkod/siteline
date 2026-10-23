import { FieldValue } from 'firebase-admin/firestore';
import { type CallableRequest, HttpsError, onCall } from 'firebase-functions/https';
import {
  deleteProjectInput,
  type Project,
  projectOnlyInput,
  type StaffMember,
  type UserDoc,
} from '@siteline/shared';

import { auth, db } from '../lib/admin';
import { requireAuth, requireStaff } from '../lib/context';
import { sha256Hex } from '../lib/crypto';
import { projectOrThrow } from '../lib/decisions';
import { callableOptions } from '../lib/env';
import { anonymiseInProject, FORMER, leave, softDeleteProject } from '../lib/privacy';
import { parseInput } from '../lib/validate';
import { detachStaff, ownerCount } from './staff';

async function userOf(uid: string): Promise<UserDoc | undefined> {
  return (await db.doc(`users/${uid}`).get()).data() as UserDoc | undefined;
}

/**
 * An owner deletes a project after typing its name (PRD F11). It disappears for everyone at
 * once; its files are purged after 30 days. The app offers the handover pack and the decisions
 * CSV first, since those records may be needed for years.
 */
export async function deleteProjectHandler(request: CallableRequest<unknown>) {
  const caller = requireStaff(request);
  if (caller.role !== 'owner') throw new HttpsError('permission-denied', 'owners_only');
  const input = parseInput(deleteProjectInput, request.data);
  const project = projectOrThrow(
    (await db.doc(`projects/${input.projectId}`).get()).data() as Project | undefined,
  );
  if (project.companyId !== caller.companyId)
    throw new HttpsError('permission-denied', 'not_on_project');
  if (input.title.trim() !== project.title.trim())
    throw new HttpsError('invalid-argument', 'title_mismatch');
  await softDeleteProject(db, input.projectId, project, caller.uid);
  return { ok: true };
}

/** A client leaves a project: their access ends and their name is taken out of it (F11). */
export async function leaveProjectHandler(request: CallableRequest<unknown>) {
  const caller = requireAuth(request);
  const input = parseInput(projectOnlyInput, request.data);
  const project = projectOrThrow(
    (await db.doc(`projects/${input.projectId}`).get()).data() as Project | undefined,
  );
  if (!caller.isClient || !project.clientUids.includes(caller.uid))
    throw new HttpsError('permission-denied', 'clients_only');
  const user = await userOf(caller.uid);
  await leave(db, input.projectId, caller.uid, user?.name ?? '', user?.locale ?? 'sv');
  return { ok: true };
}

/**
 * A client asks for their data to be removed (PRD F11): they leave every project, their
 * invites and phone lookup go, invites to other businesses lose their name, and the account is
 * deleted. Approval records keep only initials and the masked number, as evidence.
 */
export async function deleteMyDataHandler(request: CallableRequest<unknown>) {
  const caller = requireAuth(request);
  if (!caller.isClient) throw new HttpsError('permission-denied', 'clients_only');
  const user = await userOf(caller.uid);
  const projects = await db
    .collection('projects')
    .where('clientUids', 'array-contains', caller.uid)
    .get();
  for (const project of projects.docs) {
    await leave(db, project.id, caller.uid, user?.name ?? '', user?.locale ?? 'sv');
  }
  const batch = db.batch();
  const referrals = await db.collection('referrals').where('clientUid', '==', caller.uid).get();
  for (const referral of referrals.docs)
    batch.update(referral.ref, { clientUid: null, firstName: null });
  const invites = await db.collection('invites').where('uid', '==', caller.uid).get();
  for (const invite of invites.docs) batch.delete(invite.ref);
  if (user?.phoneE164) batch.delete(db.doc(`clientPhones/${sha256Hex(user.phoneE164)}`));
  await batch.commit();
  await db.recursiveDelete(db.doc(`users/${caller.uid}`));
  await auth.deleteUser(caller.uid).catch(() => undefined);
  return { ok: true };
}

/**
 * A staff member deletes their own account (PRD F11). An owner must hand ownership to someone
 * else first. Their name is taken out of the company's projects.
 */
export async function deleteMyAccountHandler(request: CallableRequest<unknown>) {
  const caller = requireStaff(request);
  const companyRef = db.doc(`companies/${caller.companyId}`);
  const staffRef = companyRef.collection('staff').doc(caller.uid);
  const me = await db.runTransaction(async (tx) => {
    const staff = (await tx.get(staffRef)).data() as StaffMember | undefined;
    if (!staff) throw new HttpsError('not-found', 'staff_not_found');
    if (staff.role === 'owner' && (await ownerCount(tx, caller.companyId)) <= 1)
      throw new HttpsError('failed-precondition', 'transfer_ownership_first');
    tx.delete(staffRef);
    tx.update(companyRef, { 'usage.staff': FieldValue.increment(-1) });
    return staff;
  });
  await detachStaff(caller.companyId, caller.uid);
  const user = await userOf(caller.uid);
  const projects = await db.collection('projects').where('companyId', '==', caller.companyId).get();
  for (const project of projects.docs) {
    await anonymiseInProject(
      db,
      project.id,
      caller.uid,
      me.name,
      FORMER.staff[user?.locale ?? 'sv'],
    );
  }
  await db.recursiveDelete(db.doc(`users/${caller.uid}`));
  await auth.deleteUser(caller.uid).catch(() => undefined);
  return { ok: true };
}

export const deleteProject = onCall(callableOptions, deleteProjectHandler);
export const leaveProject = onCall(callableOptions, leaveProjectHandler);
export const deleteMyData = onCall(callableOptions, deleteMyDataHandler);
export const deleteMyAccount = onCall(callableOptions, deleteMyAccountHandler);

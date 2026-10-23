import { FieldValue, Timestamp, type Transaction } from 'firebase-admin/firestore';
import { type CallableRequest, HttpsError, onCall } from 'firebase-functions/https';
import {
  type Company,
  effectiveLimits,
  type Invite,
  inviteStaffInput,
  removeStaffInput,
  setStaffRoleInput,
  type StaffMember,
  tokenInput,
} from '@siteline/shared';

import { auth, db } from '../lib/admin';
import { clearStaffClaims, setStaffClaims } from '../lib/claims';
import { rejectDemo, requireManager, requireNewStaff } from '../lib/context';
import { sha256Hex } from '../lib/crypto';
import { callableOptions } from '../lib/env';
import { createInvite, inviteLink, STAFF_INVITE_DAYS } from '../lib/invites';
import { queueMessage } from '../lib/outbox';
import { enforceRateLimit } from '../lib/rate-limit';
import { firstName } from '../lib/templates';
import { parseInput } from '../lib/validate';

/** Tells the person's app to refresh its ID token, so new claims apply at once (PRD F1). */
function claimsChanged(uid: string) {
  return db
    .doc(`users/${uid}`)
    .set({ claimsUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

async function getCompany(companyId: string): Promise<Company> {
  const snapshot = await db.doc(`companies/${companyId}`).get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'company_not_found');
  return snapshot.data() as Company;
}

/** Owners and admins invite staff by email or text, with a role (PRD F1). */
export async function inviteStaffHandler(request: CallableRequest<unknown>) {
  rejectDemo(request);
  const caller = requireManager(request);
  const input = parseInput(inviteStaffInput, request.data);
  await enforceRateLimit(db, `invites:${caller.companyId}`, 60, 60 * 60_000);
  const company = await getCompany(caller.companyId);
  const limit = effectiveLimits(company, Date.now()).staff;
  if (limit !== null && company.usage.staff >= limit) {
    throw new HttpsError('failed-precondition', 'plan_limit', { kind: 'staff', limit });
  }
  const inviter = (await db.doc(`companies/${caller.companyId}/staff/${caller.uid}`).get()).get(
    'name',
  ) as string;
  const expiresAt = new Date(Date.now() + STAFF_INVITE_DAYS * 86_400_000);
  const { token, hash } = await createInvite(db, {
    kind: 'staff',
    projectId: null,
    companyId: caller.companyId,
    role: input.role,
    uid: null,
    name: input.name,
    phoneE164: input.phone,
    email: input.email,
    createdBy: caller.uid,
    expiresAt: Timestamp.fromDate(expiresAt),
  });
  await queueMessage(db, {
    channel: input.email ? 'email' : 'sms',
    to: { uid: null, email: input.email, phone: input.phone },
    recipientKind: 'staff',
    template: 'staffInvite',
    params: {
      firstName: firstName(input.name),
      firm: company.name,
      inviter,
      link: inviteLink(token),
    },
    locale: company.locale,
    companyId: caller.companyId,
    projectId: null,
    dedupeKey: `staffInvite:${hash}`,
  });
  return { ok: true };
}

/** A signed-in person without a company joins through a staff invite link. */
export async function acceptStaffInviteHandler(request: CallableRequest<unknown>) {
  const caller = requireNewStaff(request);
  const { token } = parseInput(tokenInput, request.data);
  const inviteRef = db.collection('invites').doc(sha256Hex(token));

  const { companyId, role } = await db.runTransaction(async (tx) => {
    const invite = (await tx.get(inviteRef)).data() as Invite<Timestamp> | undefined;
    if (!invite || invite.kind !== 'staff') throw new HttpsError('not-found', 'invalid_link');
    if (invite.revokedAt) throw new HttpsError('failed-precondition', 'link_revoked');
    if (invite.redeemCount > 0) throw new HttpsError('failed-precondition', 'link_used');
    if (invite.expiresAt && invite.expiresAt.toMillis() < Date.now()) {
      throw new HttpsError('failed-precondition', 'link_expired');
    }
    const companyRef = db.doc(`companies/${invite.companyId}`);
    const company = (await tx.get(companyRef)).data() as Company | undefined;
    if (!company) throw new HttpsError('not-found', 'company_not_found');
    const limit = effectiveLimits(company, Date.now()).staff;
    if (limit !== null && company.usage.staff >= limit) {
      throw new HttpsError('failed-precondition', 'plan_limit', { kind: 'staff', limit });
    }
    const role = invite.role as StaffMember['role'];
    const now = FieldValue.serverTimestamp();
    const name = (request.auth?.token['name'] as string | undefined) ?? invite.name;
    tx.create(companyRef.collection('staff').doc(caller.uid), {
      role,
      name,
      email: caller.email ?? invite.email,
      phone: invite.phoneE164,
      joinedAt: now,
      notify: { push: true, email: true, quietHours: { start: '21:00', end: '07:00' } },
      createdAt: now,
      updatedAt: now,
    } satisfies StaffMember<FieldValue>);
    tx.set(
      db.doc(`users/${caller.uid}`),
      {
        kind: 'staff',
        name,
        email: caller.email ?? invite.email,
        phoneE164: invite.phoneE164,
        locale: company.locale,
        companyId: invite.companyId,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true },
    );
    tx.update(companyRef, { 'usage.staff': FieldValue.increment(1) });
    tx.update(inviteRef, { redeemCount: 1, lastRedeemedAt: now });
    return { companyId: invite.companyId, role };
  });

  await setStaffClaims(auth, caller.uid, { cid: companyId, crole: role });
  return { companyId };
}

/** Counts owners inside the transaction, so two concurrent changes can't remove the last one. */
async function ownerCount(tx: Transaction, companyId: string): Promise<number> {
  const owners = await tx.get(
    db.collection(`companies/${companyId}/staff`).where('role', '==', 'owner'),
  );
  return owners.size;
}

/** Changes a staff member's role. Only owners grant or take away ownership; one owner remains. */
export async function setStaffRoleHandler(request: CallableRequest<unknown>) {
  const caller = requireManager(request);
  const input = parseInput(setStaffRoleInput, request.data);
  const ref = db.doc(`companies/${caller.companyId}/staff/${input.uid}`);
  await db.runTransaction(async (tx) => {
    const target = (await tx.get(ref)).data() as StaffMember | undefined;
    if (!target) throw new HttpsError('not-found', 'staff_not_found');
    if ((target.role === 'owner' || input.role === 'owner') && caller.role !== 'owner') {
      throw new HttpsError('permission-denied', 'owners_only');
    }
    if (target.role === 'owner' && input.role !== 'owner') {
      if ((await ownerCount(tx, caller.companyId)) <= 1) {
        throw new HttpsError('failed-precondition', 'last_owner');
      }
    }
    tx.update(ref, { role: input.role, updatedAt: FieldValue.serverTimestamp() });
  });
  await setStaffClaims(auth, input.uid, { cid: caller.companyId, crole: input.role });
  await claimsChanged(input.uid);
  return { ok: true };
}

/** Removes a staff member from the company and every project, and signs them out. */
export async function removeStaffHandler(request: CallableRequest<unknown>) {
  const caller = requireManager(request);
  const input = parseInput(removeStaffInput, request.data);
  const companyRef = db.doc(`companies/${caller.companyId}`);
  const ref = companyRef.collection('staff').doc(input.uid);
  await db.runTransaction(async (tx) => {
    const target = (await tx.get(ref)).data() as StaffMember | undefined;
    if (!target) throw new HttpsError('not-found', 'staff_not_found');
    if (target.role === 'owner') {
      if (caller.role !== 'owner') throw new HttpsError('permission-denied', 'owners_only');
      if ((await ownerCount(tx, caller.companyId)) <= 1) {
        throw new HttpsError('failed-precondition', 'last_owner');
      }
    }
    tx.delete(ref);
    tx.update(companyRef, { 'usage.staff': FieldValue.increment(-1) });
    tx.set(db.doc(`users/${input.uid}`), { companyId: null }, { merge: true });
  });

  const projects = await db
    .collection('projects')
    .where('companyId', '==', caller.companyId)
    .where('crewUids', 'array-contains', input.uid)
    .get();
  const batch = db.batch();
  for (const project of projects.docs) {
    batch.update(project.ref, {
      crewUids: FieldValue.arrayRemove(input.uid),
      [`roles.${input.uid}`]: FieldValue.delete(),
    });
    batch.delete(project.ref.collection('members').doc(input.uid));
  }
  await batch.commit();
  await clearStaffClaims(auth, input.uid);
  await auth.revokeRefreshTokens(input.uid);
  await claimsChanged(input.uid);
  return { ok: true };
}

export const inviteStaff = onCall(callableOptions, inviteStaffHandler);
export const acceptStaffInvite = onCall(callableOptions, acceptStaffInviteHandler);
export const setStaffRole = onCall(callableOptions, setStaffRoleHandler);
export const removeStaff = onCall(callableOptions, removeStaffHandler);

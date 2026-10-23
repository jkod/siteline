import { FieldValue } from 'firebase-admin/firestore';
import { type CallableRequest, HttpsError, onCall } from 'firebase-functions/https';
import {
  type Company,
  inviteClientInput,
  maskPhone,
  type Project,
  type ProjectMember,
  projectMemberInput,
  type UserDoc,
} from '@siteline/shared';

import { db } from '../lib/admin';
import { findOrCreateClient } from '../lib/clients';
import { assertProjectStaff, rejectDemo, requireStaff, type StaffCaller } from '../lib/context';
import { callableOptions } from '../lib/env';
import { createInvite, inviteLink, revokeClientInvites } from '../lib/invites';
import { queueMessage } from '../lib/outbox';
import { enforceRateLimit } from '../lib/rate-limit';
import { firstName } from '../lib/templates';
import { parseInput } from '../lib/validate';

async function loadProject(caller: StaffCaller, projectId: string) {
  const snapshot = await db.doc(`projects/${projectId}`).get();
  const project = snapshot.data() as Project | undefined;
  if (!project) throw new HttpsError('not-found', 'project_not_found');
  assertProjectStaff(caller, project);
  return project;
}

/**
 * Issues a fresh link for a client on a project and texts it (PRD 4.1). Earlier links are
 * revoked, so only the newest one works; a device that already signed in stays signed in.
 */
async function sendClientLink(
  caller: StaffCaller,
  projectId: string,
  project: Project,
  client: { uid: string; name: string; phone: string; email: string | null },
): Promise<void> {
  await enforceRateLimit(db, `invites:${caller.companyId}`, 60, 60 * 60_000);
  await revokeClientInvites(db, projectId, client.uid);
  const company = (await db.doc(`companies/${project.companyId}`).get()).data() as Company;
  const user = (await db.doc(`users/${client.uid}`).get()).data() as UserDoc | undefined;
  const { token, hash } = await createInvite(db, {
    kind: 'client',
    projectId,
    companyId: project.companyId,
    role: 'client',
    uid: client.uid,
    name: client.name,
    phoneE164: client.phone,
    email: client.email,
    createdBy: caller.uid,
    expiresAt: null,
  });
  await db.doc(`projects/${projectId}/members/${client.uid}`).update({
    invite: { sentAt: FieldValue.serverTimestamp(), revokedAt: null },
  });
  await queueMessage(db, {
    channel: 'sms',
    to: { uid: client.uid, phone: client.phone, email: client.email },
    recipientKind: 'client',
    template: 'clientInvite',
    params: {
      firstName: firstName(client.name),
      firm: project.branding.name,
      project: project.title,
      link: inviteLink(token),
      settingsPath: '/c/settings',
    },
    locale: user?.locale ?? company.locale,
    companyId: project.companyId,
    projectId,
    dedupeKey: `clientInvite:${hash}`,
  });
}

/** Adds a client to a project and texts them their link. Their access starts at once. */
export async function addClientToProject(
  caller: StaffCaller,
  projectId: string,
  client: { name: string; phone: string; email: string | null },
): Promise<string> {
  const project = await loadProject(caller, projectId);
  const company = (await db.doc(`companies/${project.companyId}`).get()).data() as Company;
  const uid = await findOrCreateClient(db, { ...client, locale: company.locale });

  const projectRef = db.doc(`projects/${projectId}`);
  await db.runTransaction(async (tx) => {
    const memberRef = projectRef.collection('members').doc(uid);
    const member = await tx.get(memberRef);
    if (!member.exists) {
      tx.create(memberRef, {
        role: 'client',
        name: client.name,
        phoneMasked: maskPhone(client.phone),
        joinedAt: null,
        lastSeenAt: null,
        notify: { instant: false, digest: true, channel: 'sms' },
        phoneVerifiedAt: null,
        invite: null,
        createdAt: FieldValue.serverTimestamp(),
      } satisfies ProjectMember<FieldValue>);
    }
    tx.update(projectRef, {
      [`roles.${uid}`]: 'client',
      clientUids: FieldValue.arrayUnion(uid),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  await sendClientLink(caller, projectId, project, { uid, ...client });
  return uid;
}

export async function inviteClientHandler(request: CallableRequest<unknown>) {
  rejectDemo(request);
  const caller = requireStaff(request);
  const input = parseInput(inviteClientInput, request.data);
  const uid = await addClientToProject(caller, input.projectId, {
    name: input.name,
    phone: input.phone,
    email: input.email,
  });
  return { uid };
}

async function clientOnProject(projectId: string, uid: string) {
  const user = (await db.doc(`users/${uid}`).get()).data() as UserDoc | undefined;
  const member = await db.doc(`projects/${projectId}/members/${uid}`).get();
  if (!user || !member.exists || member.get('role') !== 'client' || !user.phoneE164) {
    throw new HttpsError('not-found', 'client_not_found');
  }
  return { uid, name: member.get('name') as string, phone: user.phoneE164, email: user.email };
}

export async function resendInviteHandler(request: CallableRequest<unknown>) {
  rejectDemo(request);
  const caller = requireStaff(request);
  const input = parseInput(projectMemberInput, request.data);
  const project = await loadProject(caller, input.projectId);
  await sendClientLink(
    caller,
    input.projectId,
    project,
    await clientOnProject(input.projectId, input.uid),
  );
  return { ok: true };
}

/** Stops the client's links from working. Devices already signed in stay signed in. */
export async function revokeInviteHandler(request: CallableRequest<unknown>) {
  const caller = requireStaff(request);
  const input = parseInput(projectMemberInput, request.data);
  await loadProject(caller, input.projectId);
  await clientOnProject(input.projectId, input.uid);
  await revokeClientInvites(db, input.projectId, input.uid);
  await db.doc(`projects/${input.projectId}/members/${input.uid}`).update({
    'invite.revokedAt': FieldValue.serverTimestamp(),
  });
  return { ok: true };
}

/** Removes a client from a project: their links and their access end at once (PRD F2). */
export async function removeClientHandler(request: CallableRequest<unknown>) {
  const caller = requireStaff(request);
  const input = parseInput(projectMemberInput, request.data);
  await loadProject(caller, input.projectId);
  await revokeClientInvites(db, input.projectId, input.uid);
  const projectRef = db.doc(`projects/${input.projectId}`);
  const batch = db.batch();
  batch.update(projectRef, {
    clientUids: FieldValue.arrayRemove(input.uid),
    [`roles.${input.uid}`]: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.delete(projectRef.collection('members').doc(input.uid));
  await batch.commit();
  return { ok: true };
}

export const inviteClient = onCall(callableOptions, inviteClientHandler);
export const resendInvite = onCall(callableOptions, resendInviteHandler);
export const revokeInvite = onCall(callableOptions, revokeInviteHandler);
export const removeClient = onCall(callableOptions, removeClientHandler);

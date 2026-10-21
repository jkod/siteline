import { FieldValue, type Timestamp } from 'firebase-admin/firestore';
import { type CallableRequest, HttpsError, onCall } from 'firebase-functions/https';
import { type Company, type Invite, type Project, tokenInput } from '@siteline/shared';

import { auth, db } from '../lib/admin';
import { callerIp } from '../lib/context';
import { sha256Hex } from '../lib/crypto';
import { appUrl, callableOptions } from '../lib/env';
import { queueMessage } from '../lib/outbox';
import { enforceRateLimit } from '../lib/rate-limit';
import { projectStaff } from '../lib/recipients';
import { parseInput } from '../lib/validate';

const TEN_MINUTES = 10 * 60_000;

export type RedeemResult =
  { kind: 'client'; token: string; projectId: string } | { kind: 'staff'; companyName: string };

/**
 * Exchanges a link token for a sign-in (PRD 4.1), with no sign-in needed. Client links return a
 * custom token; staff links tell the app to sign the person in and then accept the invite.
 * Rate-limited to 10 attempts per IP per 10 minutes.
 */
export async function redeemInviteHandler(
  request: CallableRequest<unknown>,
): Promise<RedeemResult> {
  await enforceRateLimit(db, `redeem:${callerIp(request)}`, 10, TEN_MINUTES);
  const { token } = parseInput(tokenInput, request.data);
  const inviteRef = db.collection('invites').doc(sha256Hex(token));
  const invite = (await inviteRef.get()).data() as Invite<Timestamp> | undefined;
  if (!invite) throw new HttpsError('not-found', 'invalid_link');
  if (invite.revokedAt) throw new HttpsError('failed-precondition', 'link_revoked');
  if (invite.expiresAt && invite.expiresAt.toMillis() < Date.now()) {
    throw new HttpsError('failed-precondition', 'link_expired');
  }

  if (invite.kind === 'staff') {
    if (invite.redeemCount > 0) throw new HttpsError('failed-precondition', 'link_used');
    const company = (await db.doc(`companies/${invite.companyId}`).get()).data() as
      Company | undefined;
    return { kind: 'staff', companyName: company?.name ?? '' };
  }

  const projectId = invite.projectId!;
  const uid = invite.uid!;
  const project = (await db.doc(`projects/${projectId}`).get()).data() as Project | undefined;
  if (!project || !project.clientUids.includes(uid))
    throw new HttpsError('failed-precondition', 'link_revoked');

  const memberRef = db.doc(`projects/${projectId}/members/${uid}`);
  await db.runTransaction(async (tx) => {
    const member = await tx.get(memberRef);
    tx.update(inviteRef, {
      redeemCount: FieldValue.increment(1),
      lastRedeemedAt: FieldValue.serverTimestamp(),
    });
    if (member.exists && !member.get('joinedAt'))
      tx.update(memberRef, { joinedAt: FieldValue.serverTimestamp() });
  });
  const customToken = await auth.createCustomToken(uid, { kind: 'client' });
  return { kind: 'client', token: customToken, projectId };
}

/**
 * From the expired-link page: tells the project's staff the client wants a new link. Always
 * answers the same way, so it reveals nothing about the link.
 */
export async function requestNewLinkHandler(request: CallableRequest<unknown>) {
  await enforceRateLimit(db, `newlink:${callerIp(request)}`, 5, 60 * 60_000);
  const { token } = parseInput(tokenInput, request.data);
  const hash = sha256Hex(token);
  const invite = (await db.doc(`invites/${hash}`).get()).data() as Invite | undefined;
  if (!invite || invite.kind !== 'client' || !invite.projectId) return { ok: true };
  const project = (await db.doc(`projects/${invite.projectId}`).get()).data() as
    Project | undefined;
  if (!project) return { ok: true };

  const day = new Date().toISOString().slice(0, 10);
  for (const staff of await projectStaff(db, project)) {
    if (!staff.email || !staff.wantsEmail) continue;
    await queueMessage(db, {
      channel: 'email',
      to: { uid: staff.uid, email: staff.email },
      recipientKind: 'staff',
      template: 'newLinkRequested',
      params: {
        client: invite.name,
        project: project.title,
        link: `${appUrl.value()}/app/projects/${invite.projectId}/people`,
      },
      locale: staff.locale,
      companyId: project.companyId,
      projectId: invite.projectId,
      dedupeKey: `newLink:${hash}:${day}:${staff.uid}`,
    });
  }
  return { ok: true };
}

export const redeemInvite = onCall(callableOptions, redeemInviteHandler);
export const requestNewLink = onCall(callableOptions, requestNewLinkHandler);

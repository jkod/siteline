import { FieldValue, type Firestore, Timestamp } from 'firebase-admin/firestore';
import type { Invite } from '@siteline/shared';

import { randomToken, sha256Hex } from './crypto';
import { appUrl } from './env';

export const STAFF_INVITE_DAYS = 14;
/** Client links stop working this long after the project is completed (PRD 4.1). */
export const CLIENT_LINK_DAYS_AFTER_COMPLETION = 90;

export function inviteLink(token: string): string {
  return `${appUrl.value()}/p/${token}`;
}

/**
 * Stores an invite under the SHA-256 of a fresh random token and returns the token. Only the
 * hash is ever stored; the token exists in the message we send and nowhere else.
 */
export async function createInvite(
  db: Firestore,
  invite: Omit<
    Invite<Timestamp | FieldValue>,
    'createdAt' | 'revokedAt' | 'redeemCount' | 'lastRedeemedAt'
  >,
): Promise<{ token: string; hash: string }> {
  const token = randomToken();
  const hash = sha256Hex(token);
  await db
    .collection('invites')
    .doc(hash)
    .create({
      ...invite,
      createdAt: FieldValue.serverTimestamp(),
      revokedAt: null,
      redeemCount: 0,
      lastRedeemedAt: null,
    });
  return { token, hash };
}

/** Revokes every open link a client has for a project. */
export async function revokeClientInvites(
  db: Firestore,
  projectId: string,
  uid: string,
): Promise<void> {
  const open = await db
    .collection('invites')
    .where('projectId', '==', projectId)
    .where('uid', '==', uid)
    .where('revokedAt', '==', null)
    .get();
  const batch = db.batch();
  for (const doc of open.docs) batch.update(doc.ref, { revokedAt: FieldValue.serverTimestamp() });
  if (!open.empty) await batch.commit();
}

/** Sets the expiry on a project's client links: 90 days from completion, or none while active. */
export async function setClientInviteExpiry(
  db: Firestore,
  projectId: string,
  expiresAt: Date | null,
): Promise<void> {
  const invites = await db.collection('invites').where('projectId', '==', projectId).get();
  for (let i = 0; i < invites.docs.length; i += 400) {
    const batch = db.batch();
    for (const doc of invites.docs.slice(i, i + 400)) {
      batch.update(doc.ref, { expiresAt: expiresAt ? Timestamp.fromDate(expiresAt) : null });
    }
    await batch.commit();
  }
}

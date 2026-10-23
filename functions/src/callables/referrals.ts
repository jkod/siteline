import { FieldValue, type Firestore, type Timestamp } from 'firebase-admin/firestore';
import { type CallableRequest, HttpsError, onCall } from 'firebase-functions/https';
import { randomInt } from 'node:crypto';
import {
  createReferralInput,
  openReferralInput,
  type Project,
  type Referral,
  type UserDoc,
} from '@siteline/shared';

import { db } from '../lib/admin';
import { callerIp, rejectDemo, requireAuth } from '../lib/context';
import { appUrl, callableOptions } from '../lib/env';
import { recordEvent } from '../lib/metrics';
import { enforceRateLimit } from '../lib/rate-limit';
import { parseInput } from '../lib/validate';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** A short code that is easy to read aloud and hard to guess: 10 characters, about 58 bits. */
export function referralCode(): string {
  return Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
}

/**
 * A client invites another business (PRD 4.5 and F20). The code records the client, the firm and
 * project the invite came from, and the kind of business. The client shares the link themselves;
 * Siteline never sends invite texts.
 */
export async function createReferralHandler(request: CallableRequest<unknown>) {
  rejectDemo(request);
  const caller = requireAuth(request);
  const input = parseInput(createReferralInput, request.data);
  const project = (await db.doc(`projects/${input.projectId}`).get()).data() as Project | undefined;
  if (!caller.isClient || !project?.clientUids.includes(caller.uid)) {
    throw new HttpsError('permission-denied', 'clients_only');
  }
  await enforceRateLimit(db, `referral:${caller.uid}`, 20, 60 * 60_000);
  const user = (await db.doc(`users/${caller.uid}`).get()).data() as UserDoc | undefined;
  const firstName = input.showFirstName ? (user?.name.trim().split(/\s+/)[0] ?? null) : null;

  const referral: Referral<FieldValue> = {
    clientUid: caller.uid,
    firstName: firstName || null,
    sourceCompanyId: project.companyId,
    sourceProjectId: input.projectId,
    businessKind: input.businessKind,
    openedCount: 0,
    signedUpCompanyId: null,
    firstPaidAt: null,
    rewardGrantedAt: null,
    createdAt: FieldValue.serverTimestamp(),
  };
  let code = referralCode();
  for (let attempt = 0; ; attempt++) {
    try {
      await db.doc(`referrals/${code}`).create(referral);
      break;
    } catch (error) {
      if (attempt >= 2) throw error;
      code = referralCode();
    }
  }
  return { code, url: `${appUrl.value()}/r/${code}` };
}

/**
 * The invite page asks what to show. It gets the client's first name if they chose to share it,
 * and the kind of business, and never the client's phone number or address (F20).
 */
export async function openReferralHandler(request: CallableRequest<unknown>) {
  await enforceRateLimit(db, `referral-open:${callerIp(request)}`, 30, 10 * 60_000);
  const { code } = parseInput(openReferralInput, request.data);
  const ref = db.doc(`referrals/${code}`);
  const referral = (await ref.get()).data() as Referral | undefined;
  if (!referral) throw new HttpsError('not-found', 'referral_not_found');
  await ref.update({ openedCount: FieldValue.increment(1) });
  await recordEvent(db, {
    name: 'invite_link_opened',
    companyId: referral.sourceCompanyId,
    props: { businessKind: referral.businessKind },
  });
  return { firstName: referral.firstName, businessKind: referral.businessKind };
}

/**
 * Stores where a new company came from, once (F20): the company's referredBy, the referral's
 * signedUpCompanyId and the inviting firm's count. Returns false for unknown or used codes.
 */
export async function attachReferral(
  firestore: Firestore,
  code: string,
  companyId: string,
): Promise<boolean> {
  const ref = firestore.doc(`referrals/${code}`);
  const attached = await firestore.runTransaction(async (tx) => {
    const referral = (await tx.get(ref)).data() as Referral<Timestamp> | undefined;
    if (!referral || referral.signedUpCompanyId || referral.sourceCompanyId === companyId) {
      return null;
    }
    tx.update(ref, { signedUpCompanyId: companyId });
    tx.update(firestore.doc(`companies/${companyId}`), {
      referredBy: { code, companyId: referral.sourceCompanyId, clientUid: referral.clientUid },
    });
    tx.update(firestore.doc(`companies/${referral.sourceCompanyId}`), {
      referralSignups: FieldValue.increment(1),
    });
    return referral;
  });
  if (attached) {
    await recordEvent(firestore, {
      name: 'referral_signup',
      companyId: attached.sourceCompanyId,
      props: { businessKind: attached.businessKind },
    });
  }
  return !!attached;
}

export const createReferral = onCall(callableOptions, createReferralHandler);
export const openReferral = onCall(callableOptions, openReferralHandler);

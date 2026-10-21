import { Timestamp } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/https';
import { type OutboxMessage, type Plan, PLAN_LIMITS } from '@siteline/shared';

import { auth, db } from '../../functions/src/lib/admin';

export { auth, db };

const projectId = () => process.env['GCLOUD_PROJECT'] ?? 'demo-siteline-test';

/** Empties Firestore and Auth between tests through the emulators' REST APIs. */
export async function resetEmulators(): Promise<void> {
  const firestore = process.env['FIRESTORE_EMULATOR_HOST'];
  const authHost = process.env['FIREBASE_AUTH_EMULATOR_HOST'];
  if (!firestore || !authHost) throw new Error('Run through npm run test:integration');
  await fetch(
    `http://${firestore}/emulator/v1/projects/${projectId()}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  await fetch(`http://${authHost}/emulator/v1/projects/${projectId()}/accounts`, {
    method: 'DELETE',
  });
}

export interface TestCaller {
  uid: string;
  token: Record<string, unknown>;
}

export function request<T = unknown>(
  caller: TestCaller | null,
  data: T,
  ip = '203.0.113.7',
): CallableRequest<unknown> {
  return {
    data,
    auth: caller ? { uid: caller.uid, token: caller.token as never, rawToken: '' } : undefined,
    rawRequest: { ip, headers: {} } as never,
    acceptsStreaming: false,
  } as CallableRequest<unknown>;
}

/** Creates an Auth user and returns a caller with the given claims. */
export async function signedInUser(
  uid: string,
  email: string | null,
  claims: Record<string, unknown> = {},
): Promise<TestCaller> {
  await auth.createUser({ uid, email: email ?? undefined });
  if (Object.keys(claims).length) await auth.setCustomUserClaims(uid, claims);
  return { uid, token: { ...claims, email } };
}

/** The caller's token after a function changed their claims. */
export async function refreshed(caller: TestCaller): Promise<TestCaller> {
  const user = await auth.getUser(caller.uid);
  return { uid: caller.uid, token: { ...user.customClaims, email: user.email ?? null } };
}

/** A company with an owner, on the given plan, written directly. */
export async function companyWithOwner(
  companyId: string,
  ownerUid: string,
  plan: Plan = 'free',
  usage: Partial<Record<'activeProjects' | 'serviceClients' | 'staff', number>> = {},
): Promise<TestCaller> {
  const owner = await signedInUser(ownerUid, `${ownerUid}@example.com`, {
    cid: companyId,
    crole: 'owner',
  });
  const now = Timestamp.now();
  await db.doc(`companies/${companyId}`).set({
    name: 'Ek & Lind Snickeri',
    orgNumber: null,
    logoPath: null,
    accentColor: '#127A69',
    locale: 'sv',
    timeZone: 'Europe/Stockholm',
    plan,
    compedUntil: null,
    limits: PLAN_LIMITS[plan],
    usage: { activeProjects: 0, serviceClients: 0, staff: 1, smsThisMonth: 0, ...usage },
    referredBy: null,
    settings: {
      digestTime: '18:00',
      reminderTime: '18:00',
      crewCanSendPricedCards: false,
      requirePhoneCheck: false,
    },
    createdAt: now,
    updatedAt: now,
  });
  await addStaff(companyId, ownerUid, 'owner', 'Erik Ek');
  return owner;
}

export async function addStaff(
  companyId: string,
  uid: string,
  role: string,
  name: string,
): Promise<void> {
  const now = Timestamp.now();
  await db.doc(`companies/${companyId}/staff/${uid}`).set({
    role,
    name,
    email: `${uid}@example.com`,
    phone: null,
    joinedAt: now,
    notify: { push: true, email: true, quietHours: { start: '21:00', end: '07:00' } },
    createdAt: now,
    updatedAt: now,
  });
  await db.doc(`users/${uid}`).set({
    kind: 'staff',
    name,
    email: `${uid}@example.com`,
    phoneE164: null,
    locale: 'sv',
    companyId,
    createdAt: now,
    updatedAt: now,
  });
}

export type QueuedMessage = OutboxMessage<Timestamp> & { id: string };

export async function outbox(): Promise<QueuedMessage[]> {
  const snapshot = await db.collection('outbox').get();
  return snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as OutboxMessage<Timestamp>) }));
}

/** Catches a rejected promise's HttpsError code and message. */
export async function failure(
  promise: Promise<unknown>,
): Promise<{ code: string; message: string }> {
  try {
    await promise;
  } catch (error) {
    const e = error as { code: string; message: string };
    return { code: e.code, message: e.message };
  }
  throw new Error('Expected the call to fail');
}

/** The token from a link in a queued invite message. */
export function tokenFromLink(link: string): string {
  return link.split('/p/')[1]!;
}

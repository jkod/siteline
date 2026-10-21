import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

import { client, createRulesEnv, crew, otherStaff, owner, type TestUser } from './env';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await createRulesEnv();
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users/owner1'), { kind: 'staff', name: 'Erik' });
    await setDoc(doc(db, 'users/client1'), { kind: 'client', name: 'Anna' });
    await setDoc(doc(db, 'companies/company1'), { name: 'Ek & Lind Snickeri' });
    await setDoc(doc(db, 'companies/company1/staff/owner1'), { role: 'owner' });
    await setDoc(doc(db, 'companies/company1/private/billing'), { status: 'active' });
    await setDoc(doc(db, 'invites/hash1'), { kind: 'client' });
    await setDoc(doc(db, 'outbox/m1'), { channel: 'sms' });
    await setDoc(doc(db, 'devOutbox/m1'), { channel: 'sms' });
    await setDoc(doc(db, 'events/e1'), { name: 'test' });
    await setDoc(doc(db, 'referrals/code1'), { clientUid: 'client1' });
  });
});

function as(user: TestUser | null) {
  return user
    ? env.authenticatedContext(user.uid, user.token).firestore()
    : env.unauthenticatedContext().firestore();
}

describe('users', () => {
  it('lets a person read their own user document', async () => {
    await assertSucceeds(getDoc(doc(as(owner), 'users/owner1')));
    await assertSucceeds(getDoc(doc(as(client), 'users/client1')));
  });

  it("denies reading someone else's user document", async () => {
    await assertFails(getDoc(doc(as(owner), 'users/client1')));
    await assertFails(getDoc(doc(as(client), 'users/owner1')));
    await assertFails(getDoc(doc(as(null), 'users/owner1')));
  });

  it('denies every write from the client SDK, even to your own document', async () => {
    await assertFails(setDoc(doc(as(owner), 'users/owner1'), { kind: 'staff', name: 'X' }));
    await assertFails(updateDoc(doc(as(client), 'users/client1'), { name: 'X' }));
    await assertFails(deleteDoc(doc(as(client), 'users/client1')));
    await assertFails(setDoc(doc(as(client), 'users/new1'), { kind: 'client' }));
  });
});

describe('companies', () => {
  it('lets staff of the company read it and its staff list', async () => {
    await assertSucceeds(getDoc(doc(as(owner), 'companies/company1')));
    await assertSucceeds(getDoc(doc(as(crew), 'companies/company1')));
    await assertSucceeds(getDoc(doc(as(crew), 'companies/company1/staff/owner1')));
  });

  it('denies staff of another company, clients and anonymous users', async () => {
    for (const user of [otherStaff, client, null]) {
      await assertFails(getDoc(doc(as(user), 'companies/company1')));
      await assertFails(getDoc(doc(as(user), 'companies/company1/staff/owner1')));
    }
  });

  it('denies writes to companies and staff from the client SDK', async () => {
    await assertFails(updateDoc(doc(as(owner), 'companies/company1'), { name: 'X' }));
    await assertFails(setDoc(doc(as(owner), 'companies/company9'), { name: 'X' }));
    await assertFails(setDoc(doc(as(owner), 'companies/company1/staff/x'), { role: 'owner' }));
    await assertFails(
      updateDoc(doc(as(crew), 'companies/company1/staff/owner1'), { role: 'crew' }),
    );
  });

  it('denies billing to everyone, owners included', async () => {
    await assertFails(getDoc(doc(as(owner), 'companies/company1/private/billing')));
    await assertFails(setDoc(doc(as(owner), 'companies/company1/private/billing'), {}));
  });
});

describe('collections only functions use', () => {
  const paths = ['invites/hash1', 'outbox/m1', 'devOutbox/m1', 'events/e1', 'referrals/code1'];

  it.each(paths)('denies reading and writing %s for every role', async (path) => {
    for (const user of [owner, crew, client, null]) {
      await assertFails(getDoc(doc(as(user), path)));
      await assertFails(setDoc(doc(as(user), path), { x: 1 }));
    }
  });

  it('denies anything not covered by a rule', async () => {
    await assertFails(getDoc(doc(as(owner), 'projects/p1')));
    await assertFails(setDoc(doc(as(owner), 'projects/p1'), { companyId: 'company1' }));
  });
});

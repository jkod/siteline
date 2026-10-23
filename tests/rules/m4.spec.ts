import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { getBytes, ref, uploadBytes, uploadString } from 'firebase/storage';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

import {
  admin,
  client,
  createRulesEnv,
  crew,
  otherClient,
  otherCrew,
  otherStaff,
  owner,
  seed,
  type TestUser,
} from './env';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await createRulesEnv();
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed(env);
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'companies/company1/private/billing'), { status: 'active', plan: 'team' });
    await setDoc(doc(db, 'projects/p1/handover/current'), { summary: 'Klart', pdf: null });
    await setDoc(doc(db, 'projects/p1/reminders/r1'), { title: 'Olja bänken', active: true });
    await setDoc(doc(db, 'projects/p1/bookingRequests/b1'), {
      clientUid: 'client1',
      status: 'open',
    });
    await setDoc(doc(db, 'projects/p1/bookingRequests/b2'), {
      clientUid: 'someone',
      status: 'open',
    });
    await uploadString(ref(context.storage(), 'projects/p1/handover/handover-v1.pdf'), 'x', 'raw', {
      contentType: 'application/pdf',
    });
  });
});

const db = (user: TestUser) => env.authenticatedContext(user.uid, user.token).firestore();
const storage = (user: TestUser) => env.authenticatedContext(user.uid, user.token).storage();

describe('billing details', () => {
  it('are for owners only, and never written from the app', async () => {
    await assertSucceeds(getDoc(doc(db(owner), 'companies/company1/private/billing')));
    for (const user of [admin, crew, client, otherStaff]) {
      await assertFails(getDoc(doc(db(user), 'companies/company1/private/billing')));
    }
    await assertFails(
      setDoc(doc(db(owner), 'companies/company1/private/billing'), { plan: 'pro' }),
    );
    await assertFails(updateDoc(doc(db(owner), 'companies/company1'), { plan: 'pro' }));
  });
});

describe('handover, reminders and booking requests', () => {
  it('let everyone on the project read the handover and reminders; only functions write', async () => {
    for (const user of [owner, crew, client]) {
      await assertSucceeds(getDoc(doc(db(user), 'projects/p1/handover/current')));
      await assertSucceeds(getDoc(doc(db(user), 'projects/p1/reminders/r1')));
    }
    for (const user of [otherCrew, otherStaff, otherClient]) {
      await assertFails(getDoc(doc(db(user), 'projects/p1/handover/current')));
    }
    await assertFails(setDoc(doc(db(owner), 'projects/p1/handover/current'), { summary: 'x' }));
    await assertFails(setDoc(doc(db(owner), 'projects/p1/reminders/r2'), { title: 'x' }));
  });

  it('show booking requests to staff and to the client who asked', async () => {
    await assertSucceeds(getDoc(doc(db(owner), 'projects/p1/bookingRequests/b2')));
    await assertSucceeds(getDoc(doc(db(client), 'projects/p1/bookingRequests/b1')));
    await assertFails(getDoc(doc(db(client), 'projects/p1/bookingRequests/b2')));
    await assertFails(
      setDoc(doc(db(client), 'projects/p1/bookingRequests/b3'), { clientUid: 'client1' }),
    );
  });

  it('let a client turn aftercare reminders off for a project', async () => {
    const member = doc(db(client), 'projects/p1/members/client1');
    const notify = { instant: false, digest: true, channel: 'sms' };
    await assertSucceeds(updateDoc(member, { notify: { ...notify, aftercare: false } }));
    await assertFails(updateDoc(member, { notify: { ...notify, aftercare: 'no' } }));
  });
});

describe('attachments and handover PDFs in Storage', () => {
  const pdf = (size = 1024, contentType = 'application/pdf') => ({
    bytes: new Uint8Array(size),
    meta: { contentType },
  });
  const upload = (user: TestUser, path: string, file = pdf()) =>
    uploadBytes(ref(storage(user), path), file.bytes, file.meta);

  it('let owners and admins attach PDFs and images up to 20 MB', async () => {
    await assertSucceeds(upload(owner, 'projects/p1/attachments/a1/manual.pdf'));
    await assertSucceeds(
      upload(admin, 'projects/p1/attachments/a2/certifikat.jpg', pdf(1024, 'image/jpeg')),
    );
    await assertFails(upload(crew, 'projects/p1/attachments/a3/x.pdf'));
    await assertFails(upload(client, 'projects/p1/attachments/a4/x.pdf'));
    await assertFails(
      upload(owner, 'projects/p1/attachments/a5/big.pdf', pdf(20 * 1024 * 1024 + 1)),
    );
    await assertFails(
      upload(owner, 'projects/p1/attachments/a6/x.zip', pdf(10, 'application/zip')),
    );
  });

  it('let everyone on the project download the handover PDF; nobody uploads one', async () => {
    for (const user of [owner, crew, client]) {
      await assertSucceeds(getBytes(ref(storage(user), 'projects/p1/handover/handover-v1.pdf')));
    }
    await assertFails(getBytes(ref(storage(otherClient), 'projects/p1/handover/handover-v1.pdf')));
    await assertFails(upload(owner, 'projects/p1/handover/handover-v2.pdf'));
  });
});

describe('push devices', () => {
  const device = { fcmToken: 'token-123', platform: 'web', lastSeenAt: serverTimestamp() };

  it('belong to the person alone', async () => {
    await assertSucceeds(setDoc(doc(db(client), 'users/client1/devices/d1'), device));
    await assertSucceeds(getDoc(doc(db(client), 'users/client1/devices/d1')));
    await assertSucceeds(deleteDoc(doc(db(client), 'users/client1/devices/d1')));
    await assertFails(setDoc(doc(db(owner), 'users/client1/devices/d2'), device));
    await assertFails(getDoc(doc(db(owner), 'users/client1/devices/d1')));
  });

  it('hold only a token and a platform', async () => {
    await assertFails(
      setDoc(doc(db(client), 'users/client1/devices/d3'), { ...device, fcmToken: '' }),
    );
    await assertFails(
      setDoc(doc(db(client), 'users/client1/devices/d4'), { ...device, extra: true }),
    );
  });
});

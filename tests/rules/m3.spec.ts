import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

import {
  client,
  createRulesEnv,
  crew,
  newPost,
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
});

const as = (user: TestUser) => env.authenticatedContext(user.uid, user.token);
const firestoreAs = (user: TestUser) => as(user).firestore();
const posts = (user: TestUser) => collection(firestoreAs(user), 'projects/p1/posts');

describe('voice-drafted posts (F5)', () => {
  it('lets staff name the recording a post came from', async () => {
    await assertSucceeds(addDoc(posts(owner), newPost(owner, { voiceId: 'rec-00000001' })));
    await assertSucceeds(addDoc(posts(crew), newPost(crew, { voiceId: 'abcdEFGH_123' })));
  });

  it('rejects malformed recording IDs and voice on client questions', async () => {
    await assertFails(addDoc(posts(owner), newPost(owner, { voiceId: '../x' })));
    await assertFails(addDoc(posts(owner), newPost(owner, { voiceId: 42 })));
    await assertFails(addDoc(posts(client), newPost(client, { voiceId: 'rec-00000001' })));
  });

  it('keeps voice drafts, referrals and metrics away from the client SDK', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'projects/p1/voice/rec-00000001'), { createdBy: 'owner1' });
      await setDoc(doc(db, 'referrals/ABCDEFGH23'), { clientUid: 'client1' });
      await setDoc(doc(db, 'metrics/company1_2026-11-01'), { counts: {} });
    });
    for (const user of [owner, crew, client]) {
      const db = firestoreAs(user);
      await assertFails(getDoc(doc(db, 'projects/p1/voice/rec-00000001')));
      await assertFails(getDoc(doc(db, 'referrals/ABCDEFGH23')));
      await assertFails(getDoc(doc(db, 'metrics/company1_2026-11-01')));
      await assertFails(setDoc(doc(db, 'referrals/MINE234567'), { clientUid: user.uid }));
    }
  });
});

describe('product events', () => {
  const event = (user: TestUser, overrides: Record<string, unknown> = {}) => ({
    name: 'invite_card_shown',
    companyId: user.token['cid'] ?? null,
    projectId: null,
    uid: user.uid,
    role: user.token['kind'] === 'client' ? 'client' : user.token['crole'],
    props: {},
    at: serverTimestamp(),
    ...overrides,
  });
  const events = (user: TestUser) => collection(firestoreAs(user), 'events');

  it('lets people record allowed events as themselves', async () => {
    await assertSucceeds(addDoc(events(client), event(client)));
    await assertSucceeds(
      addDoc(
        events(client),
        event(client, { name: 'invite_shared', projectId: 'p1', companyId: 'company1' }),
      ),
    );
    await assertSucceeds(
      addDoc(events(owner), event(owner, { name: 'voice_draft_used', props: { ms: 4200 } })),
    );
  });

  it('rejects events as someone else, in another role, of a server kind, or for others’ projects', async () => {
    await assertFails(addDoc(events(client), event(client, { uid: 'owner1' })));
    await assertFails(addDoc(events(client), event(client, { role: 'owner' })));
    await assertFails(addDoc(events(owner), event(owner, { companyId: 'company2' })));
    await assertFails(addDoc(events(client), event(client, { name: 'referral_signup' })));
    await assertFails(addDoc(events(client), event(client, { name: 'first_payment' })));
    await assertFails(
      addDoc(events(otherClient), event(otherClient, { projectId: 'p1', companyId: 'company1' })),
    );
    await assertFails(addDoc(events(client), event(client, { phone: '+46701740605' })));
    await assertFails(
      addDoc(events(client), event(client, { at: new Date('2026-01-01T00:00:00Z') })),
    );
  });

  it('never lets anyone read events', async () => {
    let id = '';
    await env.withSecurityRulesDisabled(async (context) => {
      id = (await addDoc(collection(context.firestore(), 'events'), event(owner))).id;
    });
    await assertFails(getDoc(doc(firestoreAs(owner), `events/${id}`)));
  });
});

describe('voice recordings in Storage', () => {
  const audio = (size = 1024, contentType = 'audio/webm') => ({
    bytes: new Uint8Array(size),
    meta: { contentType },
  });
  const upload = (user: TestUser, path: string, file = audio()) =>
    uploadBytes(ref(as(user).storage(), path), file.bytes, file.meta);

  it('lets staff on the project upload recordings up to 5 MB', async () => {
    await assertSucceeds(upload(owner, 'projects/p1/audio/rec-00000001.webm'));
    await assertSucceeds(
      upload(crew, 'projects/p1/audio/rec-00000002.m4a', audio(2048, 'audio/mp4')),
    );
    await assertSucceeds(
      upload(owner, 'projects/p1/audio/rec-00000003.webm', audio(1024, 'audio/webm;codecs=opus')),
    );
  });

  it('denies clients, other crew and firms, big files, other types and odd names', async () => {
    for (const user of [client, otherCrew, otherStaff]) {
      await assertFails(upload(user, 'projects/p1/audio/rec-00000004.webm'));
    }
    await assertFails(
      upload(owner, 'projects/p1/audio/rec-00000005.webm', audio(5 * 1024 * 1024 + 1)),
    );
    await assertFails(
      upload(owner, 'projects/p1/audio/rec-00000006.webm', audio(1024, 'image/jpeg')),
    );
    await assertFails(upload(owner, 'projects/p1/audio/x.webm'));
    await assertFails(upload(owner, 'projects/p1/audio/rec-00000007.mp3'));
  });
});

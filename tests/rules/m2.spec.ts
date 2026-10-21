import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
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
  newComment,
  newPost,
  otherClient,
  otherCrew,
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

const decision = {
  kind: 'extra_work',
  title: 'Byt rutten golvbjälke',
  priceOre: 650_000,
  vatRate: 0.25,
  status: 'sent',
  version: 1,
  createdByUid: 'owner1',
};

beforeEach(async () => {
  await env.clearFirestore();
  await seed(env);
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const now = Timestamp.now();
    await setDoc(doc(db, 'projects/p1/posts/draft1'), {
      ...newPost(owner, {
        type: 'decision',
        visibility: 'staff',
        decision: { ...decision, status: 'draft' },
      }),
      createdAt: now,
    });
    await setDoc(doc(db, 'projects/p1/posts/sent1'), {
      ...newPost(owner, { type: 'decision', decision }),
      createdAt: now,
    });
    await setDoc(doc(db, 'projects/p1/posts/draft1/comments/c1'), {
      ...newComment(owner),
      createdAt: now,
    });
    await setDoc(doc(db, 'projects/p1/approvals/sent1_v1'), {
      postId: 'sent1',
      version: 1,
      outcome: 'approved',
    });
    await setDoc(doc(db, 'projects/p1/visits/v1'), visit({ createdAt: now, updatedAt: now }));
    await setDoc(doc(db, 'projects/p1/checklist/i1'), item('client', { createdAt: now }));
    await setDoc(doc(db, 'projects/p1/checklist/i2'), item('firm', { createdAt: now }));
    await setDoc(
      doc(db, 'projects/p1/checklist/old'),
      item('client', {
        createdAt: now,
        doneBy: 'client1',
        doneByName: 'Anna Lindqvist',
        doneAt: Timestamp.fromMillis(Date.now() - 25 * 3600_000),
      }),
    );
    await setDoc(doc(db, 'projects/p1/visitRequests/r1'), {
      visitId: 'v1',
      kind: 'move',
      status: 'open',
    });
    await setDoc(doc(db, 'companies/company1/templates/tutoring'), { name: 'Läxhjälp' });
  });
});

function as(user: TestUser | null) {
  return user
    ? env.authenticatedContext(user.uid, user.token).firestore()
    : env.unauthenticatedContext().firestore();
}

function visit(overrides: Record<string, unknown> = {}) {
  return {
    companyId: 'company1',
    startAt: Timestamp.fromDate(new Date('2026-11-05T06:30:00Z')),
    endAt: Timestamp.fromDate(new Date('2026-11-05T15:00:00Z')),
    people: 2,
    notes: 'Vattnet avstängt 09:00-11:00',
    status: 'planned',
    fromSchedule: false,
    reportPostId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

function item(
  side: 'client' | 'firm',
  overrides: Record<string, unknown> = {},
  author: TestUser = client,
) {
  return {
    text: side === 'client' ? 'Flytta bilen från uppfarten' : 'Ta med extra skruv',
    side,
    visitId: 'v1',
    createdBy: author.uid,
    createdByName: author.name,
    createdAt: serverTimestamp(),
    doneBy: null,
    doneByName: null,
    doneAt: null,
    ...overrides,
  };
}

describe('decision cards', () => {
  it('hides drafts from clients and shows them to staff', async () => {
    await assertSucceeds(getDoc(doc(as(owner), 'projects/p1/posts/draft1')));
    await assertSucceeds(getDoc(doc(as(crew), 'projects/p1/posts/draft1')));
    await assertFails(getDoc(doc(as(client), 'projects/p1/posts/draft1')));
    await assertSucceeds(getDoc(doc(as(client), 'projects/p1/posts/sent1')));
  });

  it('lets clients list only posts for everyone, as the feed does', async () => {
    const { orderBy, limit } = await import('firebase/firestore');
    const posts = collection(as(client), 'projects/p1/posts');
    await assertSucceeds(getDocs(query(posts, where('visibility', '==', 'all'))));
    await assertSucceeds(
      getDocs(
        query(posts, where('visibility', '==', 'all'), orderBy('createdAt', 'desc'), limit(20)),
      ),
    );
    await assertFails(getDocs(posts));
  });

  it("keeps a draft's comments from clients", async () => {
    await assertFails(getDoc(doc(as(client), 'projects/p1/posts/draft1/comments/c1')));
    await assertFails(
      addDoc(collection(as(client), 'projects/p1/posts/draft1/comments'), newComment(client)),
    );
    await assertSucceeds(
      addDoc(collection(as(client), 'projects/p1/posts/sent1/comments'), newComment(client)),
    );
  });

  it('never lets the client SDK create or change a decision', async () => {
    for (const user of [owner, admin, crew, client]) {
      await assertFails(
        addDoc(
          collection(as(user), 'projects/p1/posts'),
          newPost(user, { type: 'decision', decision }),
        ),
      );
      await assertFails(
        updateDoc(doc(as(user), 'projects/p1/posts/sent1'), { 'decision.status': 'approved' }),
      );
    }
    await assertFails(
      updateDoc(doc(as(owner), 'projects/p1/posts/sent1'), {
        text: 'Ändrad',
        editedAt: serverTimestamp(),
      }),
    );
  });

  it('never lets anyone delete a sent decision', async () => {
    await assertFails(deleteDoc(doc(as(owner), 'projects/p1/posts/sent1')));
    await assertFails(
      updateDoc(doc(as(owner), 'projects/p1/posts/sent1'), {
        deletedAt: serverTimestamp(),
        text: '',
        media: [],
        unanswered: false,
      }),
    );
  });
});

describe('approval records', () => {
  it('can be read by the project and nobody else', async () => {
    await assertSucceeds(getDoc(doc(as(client), 'projects/p1/approvals/sent1_v1')));
    await assertSucceeds(getDoc(doc(as(owner), 'projects/p1/approvals/sent1_v1')));
    await assertFails(getDoc(doc(as(otherClient), 'projects/p1/approvals/sent1_v1')));
    await assertFails(getDoc(doc(as(otherCrew), 'projects/p1/approvals/sent1_v1')));
  });

  it('can never be created, changed or deleted through the client SDK (PRD F6)', async () => {
    for (const user of [owner, admin, crew, client]) {
      await assertFails(
        setDoc(doc(as(user), 'projects/p1/approvals/new1'), { outcome: 'approved' }),
      );
      await assertFails(
        updateDoc(doc(as(user), 'projects/p1/approvals/sent1_v1'), { outcome: 'declined' }),
      );
      await assertFails(deleteDoc(doc(as(user), 'projects/p1/approvals/sent1_v1')));
    }
  });
});

describe('visits', () => {
  it('lets project members read visits', async () => {
    for (const user of [owner, crew, client])
      await assertSucceeds(getDoc(doc(as(user), 'projects/p1/visits/v1')));
    for (const user of [otherCrew, otherClient])
      await assertFails(getDoc(doc(as(user), 'projects/p1/visits/v1')));
  });

  it('lets staff on the project plan, move, cancel and complete visits', async () => {
    await assertSucceeds(setDoc(doc(as(crew), 'projects/p1/visits/v2'), visit()));
    await assertSucceeds(
      updateDoc(doc(as(owner), 'projects/p1/visits/v1'), {
        startAt: Timestamp.fromDate(new Date('2026-11-06T06:30:00Z')),
        endAt: Timestamp.fromDate(new Date('2026-11-06T15:00:00Z')),
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      updateDoc(doc(as(crew), 'projects/p1/visits/v1'), {
        status: 'done',
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('denies clients, outsiders and invalid visits', async () => {
    await assertFails(setDoc(doc(as(client), 'projects/p1/visits/v2'), visit()));
    await assertFails(
      updateDoc(doc(as(client), 'projects/p1/visits/v1'), {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(setDoc(doc(as(otherCrew), 'projects/p1/visits/v2'), visit()));
    await assertFails(
      setDoc(doc(as(owner), 'projects/p1/visits/v2'), visit({ companyId: 'company2' })),
    );
    await assertFails(
      setDoc(
        doc(as(owner), 'projects/p1/visits/v2'),
        visit({ endAt: Timestamp.fromDate(new Date('2026-11-05T05:00:00Z')) }),
      ),
    );
    await assertFails(
      setDoc(doc(as(owner), 'projects/p1/visits/v2'), visit({ reportPostId: 'x' })),
    );
    await assertFails(
      updateDoc(doc(as(owner), 'projects/p1/visits/v1'), {
        reportPostId: 'x',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(deleteDoc(doc(as(owner), 'projects/p1/visits/v1')));
  });

  it("lets owners and admins list today's visits across the company", async () => {
    const { collectionGroup } = await import('firebase/firestore');
    await assertSucceeds(
      getDocs(query(collectionGroup(as(owner), 'visits'), where('companyId', '==', 'company1'))),
    );
    await assertFails(
      getDocs(query(collectionGroup(as(crew), 'visits'), where('companyId', '==', 'company1'))),
    );
    await assertFails(
      getDocs(query(collectionGroup(as(owner), 'visits'), where('companyId', '==', 'company2'))),
    );
  });
});

describe('checklist', () => {
  const ref = (user: TestUser, id: string) => doc(as(user), `projects/p1/checklist/${id}`);
  const tick = (user: TestUser) => ({
    doneBy: user.uid,
    doneByName: user.name,
    doneAt: serverTimestamp(),
  });
  const untick = { doneBy: null, doneByName: null, doneAt: null };

  it('lets anyone on the project add items for either side', async () => {
    await assertSucceeds(addDoc(collection(as(client), 'projects/p1/checklist'), item('firm')));
    await assertSucceeds(
      addDoc(collection(as(crew), 'projects/p1/checklist'), item('client', {}, crew)),
    );
    await assertFails(
      addDoc(collection(as(otherClient), 'projects/p1/checklist'), item('client', {}, otherClient)),
    );
    await assertFails(
      addDoc(
        collection(as(client), 'projects/p1/checklist'),
        item('client', { createdByName: 'Erik Ek' }),
      ),
    );
    await assertFails(
      addDoc(
        collection(as(client), 'projects/p1/checklist'),
        item('client', { doneAt: serverTimestamp() }),
      ),
    );
  });

  it('lets clients tick only client items and staff tick any item, recording who and when', async () => {
    await assertSucceeds(updateDoc(ref(client, 'i1'), tick(client)));
    await assertFails(updateDoc(ref(client, 'i2'), tick(client)));
    await assertSucceeds(updateDoc(ref(crew, 'i2'), tick(crew)));
    await assertFails(updateDoc(ref(owner, 'i2'), { ...tick(owner), doneBy: 'someone' }));
  });

  it('allows unticking within 24 hours only (PRD F7)', async () => {
    await assertSucceeds(updateDoc(ref(client, 'i1'), tick(client)));
    await assertSucceeds(updateDoc(ref(client, 'i1'), untick));
    await assertFails(updateDoc(ref(client, 'old'), untick));
    await assertFails(updateDoc(ref(owner, 'old'), untick));
  });

  it('lets the creator edit or delete an open item, and nobody move it between visits', async () => {
    await assertSucceeds(updateDoc(ref(client, 'i1'), { text: 'Flytta bilen' }));
    await assertFails(updateDoc(ref(owner, 'i1'), { text: 'X' }));
    await assertFails(updateDoc(ref(client, 'i1'), { visitId: 'v9' }));
    await assertSucceeds(deleteDoc(ref(client, 'i1')));
    await assertFails(deleteDoc(ref(client, 'old')));
  });
});

describe('visit requests and templates', () => {
  it('lets the project read visit requests but only functions write them', async () => {
    await assertSucceeds(getDoc(doc(as(client), 'projects/p1/visitRequests/r1')));
    await assertFails(
      setDoc(doc(as(client), 'projects/p1/visitRequests/r2'), { visitId: 'v1', kind: 'cancel' }),
    );
    await assertFails(
      updateDoc(doc(as(owner), 'projects/p1/visitRequests/r1'), { status: 'accepted' }),
    );
  });

  it("lets staff read their company's report templates", async () => {
    await assertSucceeds(getDoc(doc(as(crew), 'companies/company1/templates/tutoring')));
    await assertFails(getDoc(doc(as(client), 'companies/company1/templates/tutoring')));
    await assertFails(
      setDoc(doc(as(owner), 'companies/company1/templates/tutoring'), { name: 'X' }),
    );
  });
});

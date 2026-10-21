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
  everyone,
  media,
  newComment,
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

function as(user: TestUser | null) {
  return user
    ? env.authenticatedContext(user.uid, user.token).firestore()
    : env.unauthenticatedContext().firestore();
}

const projectMembers = [owner, admin, crew, client];
const outsiders = [otherCrew, otherStaff, otherClient, null];

describe('users', () => {
  it('lets a person read only their own user document', async () => {
    await assertSucceeds(getDoc(doc(as(owner), 'users/owner1')));
    await assertSucceeds(getDoc(doc(as(client), 'users/client1')));
    await assertFails(getDoc(doc(as(owner), 'users/client1')));
    await assertFails(getDoc(doc(as(client), 'users/owner1')));
    await assertFails(getDoc(doc(as(null), 'users/owner1')));
  });

  it('lets a person change their own name and language', async () => {
    await assertSucceeds(
      updateDoc(doc(as(client), 'users/client1'), {
        name: 'Anna L',
        locale: 'en',
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('lets a person choose their feed order, and only feed or chat', async () => {
    await assertSucceeds(
      updateDoc(doc(as(client), 'users/client1'), {
        feedStyle: 'chat',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(as(client), 'users/client1'), {
        feedStyle: 'timeline',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(as(owner), 'users/client1'), {
        feedStyle: 'chat',
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('denies changing kind or company, bad values, and other people', async () => {
    await assertFails(
      updateDoc(doc(as(client), 'users/client1'), { kind: 'staff', updatedAt: serverTimestamp() }),
    );
    await assertFails(
      updateDoc(doc(as(owner), 'users/owner1'), {
        companyId: 'company2',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(as(client), 'users/client1'), { locale: 'de', updatedAt: serverTimestamp() }),
    );
    await assertFails(
      updateDoc(doc(as(client), 'users/client1'), { name: '', updatedAt: serverTimestamp() }),
    );
    await assertFails(
      updateDoc(doc(as(owner), 'users/client1'), { name: 'X', updatedAt: serverTimestamp() }),
    );
    await assertFails(setDoc(doc(as(client), 'users/new1'), { kind: 'client' }));
    await assertFails(deleteDoc(doc(as(client), 'users/client1')));
  });
});

describe('companies', () => {
  const profile = (overrides: Record<string, unknown> = {}) => ({
    name: 'Ek & Lind Snickeri AB',
    accentColor: '#0E6B5C',
    orgNumber: '556016-0680',
    updatedAt: serverTimestamp(),
    ...overrides,
  });

  it('lets staff of the company read it and its staff list', async () => {
    for (const user of [owner, admin, crew, otherCrew]) {
      await assertSucceeds(getDoc(doc(as(user), 'companies/company1')));
      await assertSucceeds(getDoc(doc(as(user), 'companies/company1/staff/owner1')));
    }
  });

  it('denies staff of another company, clients and anonymous users', async () => {
    for (const user of [otherStaff, client, null]) {
      await assertFails(getDoc(doc(as(user), 'companies/company1')));
      await assertFails(getDoc(doc(as(user), 'companies/company1/staff/owner1')));
    }
  });

  it('lets owners and admins edit the profile and branding', async () => {
    await assertSucceeds(updateDoc(doc(as(owner), 'companies/company1'), profile()));
    await assertSucceeds(
      updateDoc(
        doc(as(admin), 'companies/company1'),
        profile({ logoPath: 'companies/company1/logo.png' }),
      ),
    );
  });

  it('denies crew, other companies and invalid values', async () => {
    await assertFails(updateDoc(doc(as(crew), 'companies/company1'), profile()));
    await assertFails(updateDoc(doc(as(otherStaff), 'companies/company1'), profile()));
    await assertFails(
      updateDoc(doc(as(owner), 'companies/company1'), profile({ accentColor: 'teal' })),
    );
    await assertFails(
      updateDoc(
        doc(as(owner), 'companies/company1'),
        profile({ logoPath: 'companies/company2/logo.png' }),
      ),
    );
  });

  it('denies changing plan, limits, usage or referrals from the client SDK', async () => {
    for (const field of ['plan', 'limits', 'usage', 'referredBy', 'compedUntil']) {
      await assertFails(
        updateDoc(doc(as(owner), 'companies/company1'), {
          [field]: 'x',
          updatedAt: serverTimestamp(),
        }),
      );
    }
  });

  it('lets a staff member edit their own name but not their role', async () => {
    await assertSucceeds(
      updateDoc(doc(as(crew), 'companies/company1/staff/crew1'), {
        name: 'Omar H',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(as(crew), 'companies/company1/staff/crew1'), {
        role: 'owner',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(as(crew), 'companies/company1/staff/owner1'), {
        name: 'X',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(setDoc(doc(as(owner), 'companies/company1/staff/new1'), { role: 'owner' }));
  });

  it('denies billing to everyone, owners included', async () => {
    await assertFails(getDoc(doc(as(owner), 'companies/company1/private/billing')));
    await assertFails(setDoc(doc(as(owner), 'companies/company1/private/billing'), {}));
  });
});

describe('projects', () => {
  it('lets owners, admins, assigned crew and the project clients read the project', async () => {
    for (const user of projectMembers) {
      await assertSucceeds(getDoc(doc(as(user), 'projects/p1')));
    }
  });

  it('denies unassigned crew, other companies, other clients and anonymous users', async () => {
    for (const user of outsiders) {
      await assertFails(getDoc(doc(as(user), 'projects/p1')));
    }
  });

  it('allows the list queries each role uses', async () => {
    const projects = (user: TestUser) => collection(as(user), 'projects');
    await assertSucceeds(getDocs(query(projects(owner), where('companyId', '==', 'company1'))));
    await assertSucceeds(
      getDocs(
        query(
          projects(crew),
          where('companyId', '==', 'company1'),
          where('crewUids', 'array-contains', 'crew1'),
        ),
      ),
    );
    await assertSucceeds(
      getDocs(query(projects(client), where('clientUids', 'array-contains', 'client1'))),
    );
  });

  it('denies list queries that are not limited to what the caller may read', async () => {
    await assertFails(
      getDocs(query(collection(as(crew), 'projects'), where('companyId', '==', 'company1'))),
    );
    await assertFails(
      getDocs(query(collection(as(client), 'projects'), where('companyId', '==', 'company1'))),
    );
    await assertFails(
      getDocs(query(collection(as(owner), 'projects'), where('companyId', '==', 'company2'))),
    );
  });

  it('lets owners and admins edit the details', async () => {
    await assertSucceeds(
      updateDoc(doc(as(admin), 'projects/p1'), {
        title: 'Kök och hall, Lindqvist',
        endDate: '2026-12-20',
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('denies crew and clients editing, and anyone changing people, status, branding or totals', async () => {
    await assertFails(
      updateDoc(doc(as(crew), 'projects/p1'), { title: 'X', updatedAt: serverTimestamp() }),
    );
    await assertFails(
      updateDoc(doc(as(client), 'projects/p1'), { title: 'X', updatedAt: serverTimestamp() }),
    );
    for (const field of [
      'roles',
      'clientUids',
      'crewUids',
      'status',
      'branding',
      'totals',
      'companyId',
    ]) {
      await assertFails(
        updateDoc(doc(as(owner), 'projects/p1'), { [field]: [], updatedAt: serverTimestamp() }),
      );
    }
    await assertFails(
      updateDoc(doc(as(owner), 'projects/p1'), { endDate: 'soon', updatedAt: serverTimestamp() }),
    );
  });

  it('denies creating and deleting projects from the client SDK', async () => {
    await assertFails(setDoc(doc(as(owner), 'projects/p9'), { companyId: 'company1' }));
    await assertFails(deleteDoc(doc(as(owner), 'projects/p1')));
  });

  it('cuts off a client the moment they are removed from the project', async () => {
    await assertSucceeds(getDoc(doc(as(client), 'projects/p1')));
    await env.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'projects/p1'), {
        clientUids: [],
        roles: { crew1: 'crew' },
      });
    });
    await assertFails(getDoc(doc(as(client), 'projects/p1')));
    await assertFails(getDoc(doc(as(client), 'projects/p1/posts/update1')));
    await assertFails(addDoc(collection(as(client), 'projects/p1/posts'), newPost(client)));
  });
});

describe('members', () => {
  it('lets project members read the member list', async () => {
    for (const user of projectMembers) {
      await assertSucceeds(getDoc(doc(as(user), 'projects/p1/members/client1')));
    }
    for (const user of outsiders) {
      await assertFails(getDoc(doc(as(user), 'projects/p1/members/client1')));
    }
  });

  it('lets a person update their own last-seen time and notification settings', async () => {
    await assertSucceeds(
      updateDoc(doc(as(client), 'projects/p1/members/client1'), { lastSeenAt: serverTimestamp() }),
    );
    await assertSucceeds(
      updateDoc(doc(as(client), 'projects/p1/members/client1'), {
        notify: { instant: true, digest: false, channel: 'email' },
      }),
    );
  });

  it("denies changing roles, a made-up last-seen time or someone else's settings", async () => {
    await assertFails(updateDoc(doc(as(client), 'projects/p1/members/client1'), { role: 'crew' }));
    await assertFails(
      updateDoc(doc(as(client), 'projects/p1/members/client1'), {
        lastSeenAt: Timestamp.fromMillis(0),
      }),
    );
    await assertFails(
      updateDoc(doc(as(owner), 'projects/p1/members/client1'), { lastSeenAt: serverTimestamp() }),
    );
    await assertFails(setDoc(doc(as(owner), 'projects/p1/members/new1'), { role: 'client' }));
  });
});

describe('posts', () => {
  const posts = (user: TestUser) => collection(as(user), 'projects/p1/posts');

  it('lets project members read posts and denies everyone else', async () => {
    for (const user of projectMembers) {
      await assertSucceeds(getDoc(doc(as(user), 'projects/p1/posts/update1')));
    }
    for (const user of outsiders) {
      await assertFails(getDoc(doc(as(user), 'projects/p1/posts/update1')));
    }
  });

  it('lets staff on the project post updates with photos and milestones', async () => {
    await assertSucceeds(
      addDoc(posts(owner), newPost(owner, { media: [media('p1', 'm1'), media('p1', 'm2')] })),
    );
    await assertSucceeds(addDoc(posts(crew), newPost(crew)));
    await assertSucceeds(
      addDoc(
        posts(admin),
        newPost(admin, {
          type: 'milestone',
          text: 'VVS klart',
          milestone: { stage: 3, stageCount: 4 },
        }),
      ),
    );
  });

  it('lets clients ask questions with up to five photos', async () => {
    await assertSucceeds(addDoc(posts(client), newPost(client, { media: [media('p1', 'q1')] })));
    const six = Array.from({ length: 6 }, (_, i) => media('p1', `q${i}`));
    await assertFails(addDoc(posts(client), newPost(client, { media: six })));
  });

  it('denies posts from outsiders and the wrong post types per role', async () => {
    await assertFails(addDoc(posts(otherCrew), newPost(otherCrew)));
    await assertFails(addDoc(posts(otherClient), newPost(otherClient)));
    await assertFails(
      addDoc(posts(client), newPost(client, { type: 'update', unanswered: false })),
    );
    await assertFails(addDoc(posts(owner), newPost(owner, { type: 'question', unanswered: true })));
    for (const type of ['decision', 'system', 'visit_report', 'condition']) {
      await assertFails(addDoc(posts(owner), newPost(owner, { type })));
    }
  });

  it('denies spoofed authors, roles and timestamps', async () => {
    await assertFails(addDoc(posts(crew), newPost(crew, { authorUid: 'owner1' })));
    await assertFails(addDoc(posts(crew), newPost(crew, { authorName: 'Erik Ek' })));
    await assertFails(addDoc(posts(crew), newPost(crew, { authorRole: 'owner' })));
    await assertFails(addDoc(posts(client), newPost(client, { authorRole: 'owner' })));
    await assertFails(addDoc(posts(owner), newPost(owner, { createdAt: Timestamp.fromMillis(0) })));
  });

  it('validates text length, photo counts and extra fields', async () => {
    await assertFails(addDoc(posts(owner), newPost(owner, { text: 'x'.repeat(5001) })));
    const twentyOne = Array.from({ length: 21 }, (_, i) => media('p1', `m${i}`));
    await assertFails(addDoc(posts(owner), newPost(owner, { media: twentyOne })));
    await assertSucceeds(addDoc(posts(owner), newPost(owner, { media: twentyOne.slice(0, 20) })));
    await assertFails(addDoc(posts(owner), newPost(owner, { commentCount: 5 })));
    await assertFails(addDoc(posts(owner), newPost(owner, { pinned: true })));
    await assertFails(addDoc(posts(owner), newPost(owner, { visibility: 'staff' })));
  });

  it('lets authors edit their own posts but not other people', async () => {
    await assertSucceeds(
      updateDoc(doc(as(owner), 'projects/p1/posts/update1'), {
        text: 'Rivningen är klar!',
        editedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(as(admin), 'projects/p1/posts/update1'), {
        text: 'X',
        editedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(as(owner), 'projects/p1/posts/update1'), {
        type: 'decision',
        editedAt: serverTimestamp(),
      }),
    );
  });

  it('lets authors delete their posts only as a marker, never for real', async () => {
    await assertFails(
      updateDoc(doc(as(owner), 'projects/p1/posts/update1'), {
        deletedAt: serverTimestamp(),
        text: 'kvar',
      }),
    );
    await assertSucceeds(
      updateDoc(doc(as(owner), 'projects/p1/posts/update1'), {
        deletedAt: serverTimestamp(),
        text: '',
        media: [],
      }),
    );
    await assertFails(deleteDoc(doc(as(owner), 'projects/p1/posts/question1')));
  });

  it('lets staff mark a question resolved, and nobody touch the comment count', async () => {
    await assertSucceeds(
      updateDoc(doc(as(crew), 'projects/p1/posts/question1'), { unanswered: false }),
    );
    await assertFails(
      updateDoc(doc(as(client), 'projects/p1/posts/question1'), { unanswered: false }),
    );
    await assertFails(updateDoc(doc(as(owner), 'projects/p1/posts/update1'), { commentCount: 9 }));
  });
});

describe('comments', () => {
  const comments = (user: TestUser) => collection(as(user), 'projects/p1/posts/update1/comments');

  it('lets every project member comment and read comments', async () => {
    for (const user of projectMembers) {
      await assertSucceeds(addDoc(comments(user), newComment(user)));
      await assertSucceeds(getDoc(doc(as(user), 'projects/p1/posts/update1/comments/c1')));
    }
  });

  it('denies outsiders, spoofed authors, long text and comments on missing posts', async () => {
    for (const user of outsiders.filter((u) => u !== null)) {
      await assertFails(addDoc(comments(user), newComment(user)));
    }
    await assertFails(getDoc(doc(as(null), 'projects/p1/posts/update1/comments/c1')));
    await assertFails(addDoc(comments(client), newComment(client, { authorUid: 'owner1' })));
    await assertFails(addDoc(comments(client), newComment(client, { authorRole: 'owner' })));
    await assertFails(addDoc(comments(client), newComment(client, { text: 'x'.repeat(2001) })));
    await assertFails(addDoc(comments(client), newComment(client, { text: '' })));
    await assertFails(
      addDoc(collection(as(client), 'projects/p1/posts/nope/comments'), newComment(client)),
    );
  });

  it('lets authors edit and delete their own comments, and nobody else', async () => {
    const ref = (user: TestUser) => doc(as(user), 'projects/p1/posts/update1/comments/c1');
    await assertSucceeds(
      updateDoc(ref(client), { text: 'Tack så mycket!', editedAt: serverTimestamp() }),
    );
    await assertFails(updateDoc(ref(owner), { text: 'X', editedAt: serverTimestamp() }));
    await assertSucceeds(
      updateDoc(ref(client), { text: '', media: [], deletedAt: serverTimestamp() }),
    );
    await assertFails(deleteDoc(ref(client)));
  });
});

describe('collections only functions use', () => {
  const paths = [
    'invites/hash1',
    'outbox/m1',
    'devOutbox/m1',
    'events/e1',
    'referrals/code1',
    'rateLimits/r1',
    'clientPhones/x1',
  ];

  it.each(paths)('denies reading and writing %s for every role', async (path) => {
    for (const user of [...everyone, null]) {
      await assertFails(getDoc(doc(as(user), path)));
      await assertFails(setDoc(doc(as(user), path), { x: 1 }));
    }
  });
});

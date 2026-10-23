import { Timestamp } from 'firebase-admin/firestore';

import { inviteClientHandler } from '../../functions/src/callables/clients';
import {
  respondToDecisionHandler,
  saveDecisionDraftHandler,
  sendDecisionHandler,
} from '../../functions/src/callables/decisions';
import {
  deleteMyAccountHandler,
  deleteMyDataHandler,
  deleteProjectHandler,
  leaveProjectHandler,
} from '../../functions/src/callables/privacy';
import { createProjectHandler } from '../../functions/src/callables/projects';
import { bucket } from '../../functions/src/lib/admin';
import { initials, purgeDeletedProjects } from '../../functions/src/lib/privacy';
import {
  addStaff,
  auth,
  companyWithOwner,
  db,
  failure,
  request,
  resetEmulators,
  signedInUser,
  type TestCaller,
} from './harness';

beforeEach(resetEmulators);

const reason = async (p: Promise<unknown>) => (await failure(p)).message;

/** A project where Anna asked a question and approved an extra. */
async function setup() {
  const owner = await companyWithOwner('c1', 'erik', 'team');
  const { projectId } = await createProjectHandler(request(owner, { title: 'Kök Lindqvist' }));
  const { uid } = await inviteClientHandler(
    request(owner, { projectId, name: 'Anna Lindqvist', phone: '0701740605' }),
  );
  await auth.createUser({ uid });
  const anna: TestCaller = { uid, token: { kind: 'client' } };
  await db.collection(`projects/${projectId}/posts`).doc('q1').set({
    type: 'question',
    authorUid: uid,
    authorName: 'Anna Lindqvist',
    authorRole: 'client',
    text: 'När kommer elektrikern?',
    media: [],
    visibility: 'all',
    commentCount: 1,
    unanswered: false,
    createdAt: Timestamp.now(),
  });
  await db.doc(`projects/${projectId}/posts/q1/comments/k1`).set({
    authorUid: uid,
    authorName: 'Anna Lindqvist',
    authorRole: 'client',
    text: 'Tack!',
    createdAt: Timestamp.now(),
  });
  const { postId } = await saveDecisionDraftHandler(
    request(owner, {
      projectId,
      decision: { kind: 'extra_work', title: 'Uttag', priceOre: 180_000 },
    }),
  );
  await sendDecisionHandler(request(owner, { projectId, postId }));
  await respondToDecisionHandler(
    request(anna, { projectId, postId, version: 1, outcome: 'approved' }),
  );
  return { owner, anna, projectId, decisionId: postId };
}

it('shortens names to initials', () => {
  expect(initials('Anna Lindqvist')).toBe('A. L.');
  expect(initials('  per  ')).toBe('P.');
});

describe('deleting a project (F11)', () => {
  it('needs the owner and the exact name, then it is gone for everyone at once', async () => {
    const { owner, projectId } = await setup();
    await addStaff('c1', 'omar', 'admin', 'Omar');
    const admin = await signedInUser('omar', 'omar@example.com', { cid: 'c1', crole: 'admin' });
    expect(
      await reason(deleteProjectHandler(request(admin, { projectId, title: 'Kök Lindqvist' }))),
    ).toBe('owners_only');
    expect(await reason(deleteProjectHandler(request(owner, { projectId, title: 'Kök' })))).toBe(
      'title_mismatch',
    );
    const usageBefore = (await db.doc('companies/c1').get()).get('usage.activeProjects');
    await deleteProjectHandler(request(owner, { projectId, title: 'Kök Lindqvist' }));
    expect((await db.doc(`projects/${projectId}`).get()).exists).toBe(false);
    expect(
      (await db.collection('projects').where('clientUids', 'array-contains-any', ['x']).get()).size,
    ).toBe(0);
    expect((await db.doc(`deletedProjects/${projectId}`).get()).get('title')).toBe('Kök Lindqvist');
    expect((await db.doc('companies/c1').get()).get('usage.activeProjects')).toBe(usageBefore - 1);
    const links = await db.collection('invites').where('projectId', '==', projectId).get();
    expect(links.docs.every((d) => d.get('revokedAt'))).toBe(true);
  });

  it('purges posts, approvals and files 30 days later', async () => {
    const { owner, projectId } = await setup();
    await bucket().file(`projects/${projectId}/media/m1/display.jpg`).save(Buffer.from('x'));
    const now = new Date();
    await deleteProjectHandler(request(owner, { projectId, title: 'Kök Lindqvist' }));
    expect(await purgeDeletedProjects(db, new Date(now.getTime() + 29 * 86_400_000))).toBe(0);
    expect((await db.collection(`projects/${projectId}/posts`).get()).size).toBeGreaterThan(0);
    expect(await purgeDeletedProjects(db, new Date(now.getTime() + 30 * 86_400_000 + 60_000))).toBe(
      1,
    );
    expect((await db.collection(`projects/${projectId}/posts`).get()).size).toBe(0);
    expect((await db.collection(`projects/${projectId}/approvals`).get()).size).toBe(0);
    const [files] = await bucket().getFiles({ prefix: `projects/${projectId}/` });
    expect(files).toHaveLength(0);
  });
});

describe('a client leaving and removing their data (F11)', () => {
  it('leaving ends access and takes their name out, keeping initials on the evidence', async () => {
    const { anna, projectId, decisionId } = await setup();
    await leaveProjectHandler(request(anna, { projectId }));
    const project = (await db.doc(`projects/${projectId}`).get()).data()!;
    expect(project['clientUids']).not.toContain(anna.uid);
    expect((await db.doc(`projects/${projectId}/members/${anna.uid}`).get()).exists).toBe(false);
    expect((await db.doc(`projects/${projectId}/posts/q1`).get()).get('authorName')).toBe(
      'Tidigare kund',
    );
    expect(
      (await db.doc(`projects/${projectId}/posts/q1/comments/k1`).get()).get('authorName'),
    ).toBe('Tidigare kund');
    expect(
      (await db.doc(`projects/${projectId}/posts/${decisionId}`).get()).get(
        'decision.decidedByName',
      ),
    ).toBe('A. L.');
    const [approval] = (await db.collection(`projects/${projectId}/approvals`).get()).docs;
    expect(approval!.data()).toMatchObject({
      actorName: 'A. L.',
      outcome: 'approved',
      priceOre: 180_000,
    });
    expect(approval!.get('actorPhoneMasked')).not.toContain('740605');
    expect(await reason(leaveProjectHandler(request(anna, { projectId })))).toBe('clients_only');
  });

  it('removing their data leaves no name or number anywhere but the anonymised evidence', async () => {
    const { anna, projectId } = await setup();
    await db
      .doc('referrals/ABCDEFGH23')
      .set({ clientUid: anna.uid, firstName: 'Anna', sourceCompanyId: 'c1' });
    await deleteMyDataHandler(request(anna, {}));
    expect((await db.doc(`users/${anna.uid}`).get()).exists).toBe(false);
    expect((await db.collection('clientPhones').get()).size).toBe(0);
    expect((await db.collection('invites').where('uid', '==', anna.uid).get()).size).toBe(0);
    expect((await db.doc('referrals/ABCDEFGH23').get()).data()).toMatchObject({
      clientUid: null,
      firstName: null,
    });
    await expect(auth.getUser(anna.uid)).rejects.toThrow();

    // Search the whole project for the name and number.
    const dump: string[] = [];
    const walk = async (ref: FirebaseFirestore.DocumentReference) => {
      const snap = await ref.get();
      if (snap.exists) dump.push(JSON.stringify(snap.data()));
      for (const sub of await ref.listCollections()) {
        for (const doc of (await sub.get()).docs) await walk(doc.ref);
      }
    };
    await walk(db.doc(`projects/${projectId}`));
    const all = dump.join('\n');
    expect(all).not.toContain('Anna');
    expect(all).not.toContain('Lindqvist A');
    expect(all).not.toContain('740605');
  });
});

describe('staff deleting their account (F11)', () => {
  it('an owner must hand over ownership first; others are removed and anonymised', async () => {
    const { owner, projectId } = await setup();
    expect(await reason(deleteMyAccountHandler(request(owner, {})))).toBe(
      'transfer_ownership_first',
    );

    await addStaff('c1', 'omar', 'crew', 'Omar Haddad');
    const crew = await signedInUser('omar', 'omar@example.com', { cid: 'c1', crole: 'crew' });
    await db.doc(`projects/${projectId}`).update({ crewUids: ['omar'] });
    await db.collection(`projects/${projectId}/posts`).doc('u1').set({
      type: 'update',
      authorUid: 'omar',
      authorName: 'Omar Haddad',
      authorRole: 'crew',
      text: 'Klart',
      createdAt: Timestamp.now(),
    });
    await deleteMyAccountHandler(request(crew, {}));
    expect((await db.doc('companies/c1/staff/omar').get()).exists).toBe(false);
    expect((await db.doc(`projects/${projectId}`).get()).get('crewUids')).toEqual([]);
    expect((await db.doc(`projects/${projectId}/posts/u1`).get()).get('authorName')).toBe(
      'Tidigare medarbetare',
    );
    expect((await db.doc('users/omar').get()).exists).toBe(false);
  });
});

import { Timestamp } from 'firebase-admin/firestore';

import { inviteClientHandler } from '../../functions/src/callables/clients';
import { startDemoHandler } from '../../functions/src/callables/demo';
import {
  redeemInviteHandler,
  requestClientSignInHandler,
} from '../../functions/src/callables/links';
import { createReferralHandler } from '../../functions/src/callables/referrals';
import { bucket } from '../../functions/src/lib/admin';
import { deliver } from '../../functions/src/lib/delivery';
import { queueMessage } from '../../functions/src/lib/outbox';
import { purgeDemos } from '../../functions/src/scheduled/maintenance';
import {
  auth,
  companyWithOwner,
  db,
  failure,
  outbox,
  request,
  resetEmulators,
  type TestCaller,
  tokenFromLink,
} from './harness';

beforeEach(resetEmulators);

const reason = async (promise: Promise<unknown>) => (await failure(promise)).message;

describe('try Siteline sandboxes', () => {
  it('gives a firm its own company with a project, a client and a decision to look at', async () => {
    const { token, kind } = await startDemoHandler(request(null, { kind: 'firm', locale: 'sv' }));
    expect(kind).toBe('firm');
    expect(token).toBeTruthy();
    const demo = (await db.collection('demos').get()).docs[0]!.data();
    const user = await auth.getUser(demo['uid']);
    expect(user.email).toBeUndefined();
    expect(user.phoneNumber).toBeUndefined();
    expect(user.customClaims).toMatchObject({
      cid: demo['companyIds'][0],
      crole: 'owner',
      demo: true,
    });

    const company = (await db.doc(`companies/${demo['companyIds'][0]}`).get()).data()!;
    expect(company).toMatchObject({ name: 'Ek & Lind Snickeri', demo: true });
    const [projectId] = demo['projectIds'];
    const project = (await db.doc(`projects/${projectId}`).get()).data()!;
    expect(project['companyId']).toBe(demo['companyIds'][0]);
    expect(project['clientUids']).toHaveLength(1);
    const posts = await db.collection(`projects/${projectId}/posts`).get();
    expect(posts.size).toBeGreaterThan(8);
    expect(posts.docs.some((d) => d.get('decision.status') === 'sent')).toBe(true);
    const [photo] = posts.docs.find((d) => d.get('media')?.length)!.get('media');
    expect((await bucket().file(photo.path).exists())[0]).toBe(true);
  });

  it('gives a client projects from two firms, including weekly visits', async () => {
    await startDemoHandler(request(null, { kind: 'client', locale: 'en' }));
    const demo = (await db.collection('demos').get()).docs[0]!.data();
    expect((await auth.getUser(demo['uid'])).customClaims).toEqual({ kind: 'client', demo: true });
    const projects = await db
      .collection('projects')
      .where('clientUids', 'array-contains', demo['uid'])
      .get();
    expect(projects.docs.map((d) => d.get('branding.name')).sort()).toEqual([
      'Berg Mattehjälp',
      'Ek & Lind Snickeri',
    ]);
    const tutoring = projects.docs.find((d) => d.get('kind') === 'service')!;
    expect(tutoring.get('nextVisitId')).toBeTruthy();
    expect((await db.doc(`users/${demo['uid']}`).get()).get('locale')).toBe('en');
  });

  it('never reaches real people: no invites or referrals, and anything queued is suppressed', async () => {
    await startDemoHandler(request(null, { kind: 'firm', locale: 'sv' }));
    const demo = (await db.collection('demos').get()).docs[0]!.data();
    const firm: TestCaller = {
      uid: demo['uid'],
      token: { cid: demo['companyIds'][0], crole: 'owner', demo: true },
    };
    expect(
      await reason(
        inviteClientHandler(
          request(firm, {
            projectId: demo['projectIds'][0],
            name: 'Riktig Person',
            phone: '0701740650',
          }),
        ),
      ),
    ).toBe('demo_mode');
    const client: TestCaller = { uid: 'x', token: { kind: 'client', demo: true } };
    expect(
      await reason(
        createReferralHandler(
          request(client, {
            projectId: demo['projectIds'][0],
            businessKind: 'garden',
            showFirstName: true,
          }),
        ),
      ),
    ).toBe('demo_mode');

    await queueMessage(db, {
      channel: 'sms',
      to: { uid: 'x', phone: '+46701740650' },
      recipientKind: 'staff',
      template: 'staffReply',
      params: { firm: 'Ek & Lind', project: 'Kök', link: 'http://x' },
      locale: 'sv',
      companyId: demo['companyIds'][0],
      projectId: null,
      dedupeKey: 'demo-message',
    });
    const sent: string[] = [];
    const senders = {
      sms: () => ({ send: async () => (sent.push('sms'), { providerMessageId: 'sms' }) }),
      email: () => ({ send: async () => (sent.push('email'), { providerMessageId: 'email' }) }),
    };
    const [message] = await outbox();
    await deliver(db, message!.id, senders);
    expect(sent).toEqual([]);
    expect((await outbox())[0]).toMatchObject({ status: 'suppressed', error: 'demo' });
  });

  it('deletes a sandbox and its account after three days', async () => {
    const now = new Date();
    await startDemoHandler(request(null, { kind: 'client', locale: 'sv' }));
    const demo = (await db.collection('demos').get()).docs[0]!.data();
    expect(await purgeDemos(db, new Date(now.getTime() + 2 * 86_400_000))).toBe(0);
    expect(await purgeDemos(db, new Date(now.getTime() + 3 * 86_400_000 + 60_000))).toBe(1);
    for (const id of demo['projectIds']) {
      expect((await db.doc(`projects/${id}`).get()).exists).toBe(false);
      expect((await db.collection(`projects/${id}/posts`).get()).size).toBe(0);
      const [files] = await bucket().getFiles({ prefix: `projects/${id}/` });
      expect(files).toHaveLength(0);
    }
    for (const id of demo['companyIds']) {
      expect((await db.doc(`companies/${id}`).get()).exists).toBe(false);
    }
    expect((await db.doc(`users/${demo['uid']}`).get()).exists).toBe(false);
    await expect(auth.getUser(demo['uid'])).rejects.toThrow();
  });
});

describe('client sign-in by link', () => {
  async function client() {
    const owner = await companyWithOwner('c1', 'erik', 'team');
    await db.doc('projects/p1').set({
      companyId: 'c1',
      kind: 'project',
      status: 'active',
      title: 'Kök',
      clientUids: [],
      crewUids: [],
      branding: { name: 'Ek & Lind' },
      totals: { approvedExtraWorkOre: 0, openDecisions: 0, unansweredQuestions: 0 },
      roles: {},
    });
    const { uid } = await inviteClientHandler(
      request(owner, {
        projectId: 'p1',
        name: 'Anna Lindqvist',
        phone: '070-174 06 05',
        email: 'anna@example.com',
      }),
    );
    return uid;
  }
  const signInMessages = async () => (await outbox()).filter((m) => m.template === 'clientSignIn');

  it('texts a one-time sign-in link to a known number, straight away even in quiet hours', async () => {
    const uid = await client();
    await expect(
      requestClientSignInHandler(request(null, { contact: '0701740605' })),
    ).resolves.toEqual({ ok: true });
    const [message] = await signInMessages();
    expect(message).toMatchObject({ channel: 'sms', to: { uid, phone: '+46701740605' } });
    expect(message!.sendAfter.toMillis()).toBeLessThanOrEqual(Date.now());

    const token = tokenFromLink(message!.params['link']!);
    const result = await redeemInviteHandler(request(null, { token }));
    expect(result).toMatchObject({ kind: 'client', projectId: null });
    expect(await reason(redeemInviteHandler(request(null, { token })))).toBe('link_used');
  });

  it('emails the link to a known client address', async () => {
    const uid = await client();
    await requestClientSignInHandler(request(null, { contact: 'Anna@Example.com' }));
    const [message] = await signInMessages();
    expect(message).toMatchObject({ channel: 'email', to: { uid, email: 'anna@example.com' } });
  });

  it('answers the same for unknown numbers and staff, and sends nothing', async () => {
    await client();
    await expect(
      requestClientSignInHandler(request(null, { contact: '0701740699' })),
    ).resolves.toEqual({ ok: true });
    await expect(
      requestClientSignInHandler(request(null, { contact: 'erik@example.com' })),
    ).resolves.toEqual({ ok: true });
    expect(await signInMessages()).toHaveLength(0);
    expect(await reason(requestClientSignInHandler(request(null, { contact: 'hej hej' })))).toBe(
      'invalid_contact',
    );
  });

  it('stops working after 30 minutes', async () => {
    await client();
    await requestClientSignInHandler(request(null, { contact: '0701740605' }));
    const [message] = await signInMessages();
    const token = tokenFromLink(message!.params['link']!);
    const invites = await db.collection('invites').where('kind', '==', 'signin').get();
    await invites.docs[0]!.ref.update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
    expect(await reason(redeemInviteHandler(request(null, { token })))).toBe('link_expired');
  });
});

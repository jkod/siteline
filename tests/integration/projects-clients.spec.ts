import { Timestamp } from 'firebase-admin/firestore';
import { gsm7Length } from '@siteline/shared';

import {
  inviteClientHandler,
  removeClientHandler,
  resendInviteHandler,
  revokeInviteHandler,
} from '../../functions/src/callables/clients';
import { redeemInviteHandler, requestNewLinkHandler } from '../../functions/src/callables/links';
import {
  assignCrewHandler,
  createProjectHandler,
  setProjectStatusHandler,
} from '../../functions/src/callables/projects';
import {
  addStaff,
  auth,
  companyWithOwner,
  db,
  failure,
  outbox,
  request,
  resetEmulators,
  signedInUser,
  type TestCaller,
  tokenFromLink,
} from './harness';

beforeEach(resetEmulators);

async function ownerWithProject(plan: 'free' | 'team' = 'free') {
  const owner = await companyWithOwner('c1', 'erik', plan);
  const { projectId } = await createProjectHandler(
    request(owner, { title: 'Köksrenovering Lindqvist', startDate: '2026-10-01' }),
  );
  return { owner, projectId };
}

async function inviteAnna(caller: TestCaller, projectId: string) {
  return inviteClientHandler(
    request(caller, { projectId, name: 'Anna Lindqvist', phone: '070-174 06 05', email: '' }),
  );
}

async function latestInviteToken(): Promise<string> {
  const invites = (await outbox()).filter((m) => m.template === 'clientInvite');
  const latest = invites.sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis()).at(-1)!;
  return tokenFromLink(latest.params['link']!);
}

describe('createProject', () => {
  it('creates a project with branding and counts it against the plan', async () => {
    const { projectId } = await ownerWithProject();
    const project = (await db.doc(`projects/${projectId}`).get()).data()!;
    expect(project).toMatchObject({
      companyId: 'c1',
      kind: 'project',
      status: 'active',
      title: 'Köksrenovering Lindqvist',
      branding: { name: 'Ek & Lind Snickeri', accentColor: '#127A69', showSitelineFooter: true },
      clientUids: [],
    });
    expect((await db.doc('companies/c1').get()).get('usage.activeProjects')).toBe(1);
  });

  it('blocks a project beyond the plan limit on the server (PRD F2)', async () => {
    const { owner } = await ownerWithProject('free');
    const result = await failure(createProjectHandler(request(owner, { title: 'Badrum Berg' })));
    expect(result).toEqual({ code: 'failed-precondition', message: 'plan_limit' });
    expect((await db.collection('projects').get()).size).toBe(1);
  });

  it('gives design partners Team limits while comped', async () => {
    const { owner } = await ownerWithProject('free');
    await db
      .doc('companies/c1')
      .update({ compedUntil: Timestamp.fromMillis(Date.now() + 86_400_000) });
    await expect(
      createProjectHandler(request(owner, { title: 'Badrum Berg' })),
    ).resolves.toHaveProperty('projectId');
  });

  it('lets only owners and admins create projects, with crew from the company', async () => {
    const owner = await companyWithOwner('c1', 'erik', 'team');
    const crew = await signedInUser('omar', 'omar@example.com', { cid: 'c1', crole: 'crew' });
    await addStaff('c1', 'omar', 'crew', 'Omar Haddad');
    expect((await failure(createProjectHandler(request(crew, { title: 'X' })))).code).toBe(
      'permission-denied',
    );
    expect(
      (await failure(createProjectHandler(request(owner, { title: 'X', crewUids: ['stranger'] }))))
        .message,
    ).toBe('unknown_crew');
    const { projectId } = await createProjectHandler(
      request(owner, { title: 'X', crewUids: ['omar'] }),
    );
    expect((await db.doc(`projects/${projectId}`).get()).get('crewUids')).toEqual(['omar']);
    expect((await db.doc(`projects/${projectId}/members/omar`).get()).get('role')).toBe('crew');
  });
});

describe('setProjectStatus and assignCrew', () => {
  it('frees the slot on completion, blocks reactivation at the limit and expires links after 90 days', async () => {
    const { owner, projectId } = await ownerWithProject('free');
    await inviteAnna(owner, projectId);
    await setProjectStatusHandler(request(owner, { projectId, status: 'completed' }));
    expect((await db.doc('companies/c1').get()).get('usage.activeProjects')).toBe(0);
    const invite = (await db.collection('invites').get()).docs[0]!;
    const days = ((invite.get('expiresAt') as Timestamp).toMillis() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(89.9);

    await createProjectHandler(request(owner, { title: 'Badrum Berg' }));
    expect(
      (await failure(setProjectStatusHandler(request(owner, { projectId, status: 'active' }))))
        .message,
    ).toBe('plan_limit');
  });

  it('replaces the crew on a project', async () => {
    const { owner, projectId } = await ownerWithProject('team');
    await addStaff('c1', 'omar', 'crew', 'Omar');
    await addStaff('c1', 'nils', 'crew', 'Nils');
    await assignCrewHandler(request(owner, { projectId, crewUids: ['omar'] }));
    await assignCrewHandler(request(owner, { projectId, crewUids: ['nils'] }));
    const project = (await db.doc(`projects/${projectId}`).get()).data()!;
    expect(project['crewUids']).toEqual(['nils']);
    expect(project['roles']).toEqual({ nils: 'crew' });
    expect((await db.doc(`projects/${projectId}/members/omar`).get()).exists).toBe(false);
  });
});

describe('client invites and links', () => {
  it('adds the client, texts a link within 160 characters and gives access at once', async () => {
    const { owner, projectId } = await ownerWithProject();
    const { uid } = await inviteAnna(owner, projectId);
    const project = (await db.doc(`projects/${projectId}`).get()).data()!;
    expect(project['clientUids']).toEqual([uid]);
    expect(project['roles'][uid]).toBe('client');
    const member = (await db.doc(`projects/${projectId}/members/${uid}`).get()).data()!;
    expect(member['phoneMasked']).toBe('+46 70 *** ** 05');
    expect(member['joinedAt']).toBeNull();

    const [message] = await outbox();
    expect(message).toMatchObject({ channel: 'sms', template: 'clientInvite', status: 'queued' });
    expect(message.to.phone).toBe('+46701740605');
    expect(message.params['link']).toMatch(/^http:\/\/localhost:4300\/p\/[\w-]{43}$/);
    // Only the token's hash is stored.
    const invites = await db.collection('invites').get();
    expect(invites.docs[0]!.id).not.toContain(tokenFromLink(message.params['link']!));
    expect(JSON.stringify(invites.docs[0]!.data())).not.toContain(
      tokenFromLink(message.params['link']!),
    );
    const text = `Hej Anna! Ek & Lind Snickeri delar uppdateringar om Köksrenovering Lindqvist här: ${message.params['link']}`;
    expect(gsm7Length(text)).toBeLessThanOrEqual(160);
  });

  it('reuses the same client user when another firm invites the same number (PRD 4.5)', async () => {
    const { owner, projectId } = await ownerWithProject();
    const first = await inviteAnna(owner, projectId);
    const tutor = await companyWithOwner('c2', 'karin', 'visits');
    const { projectId: second } = await createProjectHandler(
      request(tutor, { kind: 'service', title: 'Matte med Elsa' }),
    );
    const again = await inviteClientHandler(
      request(tutor, { projectId: second, name: 'Anna L', phone: '+46701740605' }),
    );
    expect(again.uid).toBe(first.uid);
    expect((await db.collection('users').where('kind', '==', 'client').get()).size).toBe(1);
  });

  it('lets assigned crew invite, but not crew from elsewhere', async () => {
    const owner = await companyWithOwner('c1', 'erik', 'team');
    await addStaff('c1', 'omar', 'crew', 'Omar');
    await addStaff('c1', 'nils', 'crew', 'Nils');
    const { projectId } = await createProjectHandler(
      request(owner, { title: 'Kök', crewUids: ['omar'] }),
    );
    const omar = await signedInUser('omar', 'omar@example.com', { cid: 'c1', crole: 'crew' });
    const nils = await signedInUser('nils', 'nils@example.com', { cid: 'c1', crole: 'crew' });
    await expect(inviteAnna(omar, projectId)).resolves.toHaveProperty('uid');
    expect((await failure(inviteAnna(nils, projectId))).code).toBe('permission-denied');
  });

  it('redeems a link for a client sign-in and marks the client joined', async () => {
    const { owner, projectId } = await ownerWithProject();
    const { uid } = await inviteAnna(owner, projectId);
    const result = await redeemInviteHandler(request(null, { token: await latestInviteToken() }));
    expect(result).toMatchObject({ kind: 'client', projectId });
    expect(result.kind === 'client' && result.token.length).toBeGreaterThan(100);
    expect(
      (await db.doc(`projects/${projectId}/members/${uid}`).get()).get('joinedAt'),
    ).toBeTruthy();
    // The same link works again on another device.
    await expect(
      redeemInviteHandler(request(null, { token: await latestInviteToken() })),
    ).resolves.toMatchObject({
      kind: 'client',
    });
    // Client accounts hold no contact details in Firebase Authentication.
    await expect(auth.getUser(uid)).rejects.toThrow();
  });

  it('stops old links on resend and revoke, and after the client is removed', async () => {
    const { owner, projectId } = await ownerWithProject();
    const { uid } = await inviteAnna(owner, projectId);
    const first = await latestInviteToken();
    await resendInviteHandler(request(owner, { projectId, uid }));
    const second = await latestInviteToken();
    expect(second).not.toBe(first);
    expect((await failure(redeemInviteHandler(request(null, { token: first })))).message).toBe(
      'link_revoked',
    );
    await expect(redeemInviteHandler(request(null, { token: second }))).resolves.toMatchObject({
      kind: 'client',
    });

    await revokeInviteHandler(request(owner, { projectId, uid }));
    expect((await failure(redeemInviteHandler(request(null, { token: second })))).message).toBe(
      'link_revoked',
    );

    await resendInviteHandler(request(owner, { projectId, uid }));
    const third = await latestInviteToken();
    await removeClientHandler(request(owner, { projectId, uid }));
    expect((await failure(redeemInviteHandler(request(null, { token: third })))).message).toBe(
      'link_revoked',
    );
    expect((await db.doc(`projects/${projectId}`).get()).get('clientUids')).toEqual([]);
  });

  it('rejects unknown and expired links', async () => {
    const { owner, projectId } = await ownerWithProject();
    await inviteAnna(owner, projectId);
    expect(
      (await failure(redeemInviteHandler(request(null, { token: 'x'.repeat(43) })))).code,
    ).toBe('not-found');
    const invite = (await db.collection('invites').get()).docs[0]!;
    await invite.ref.update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
    expect(
      (await failure(redeemInviteHandler(request(null, { token: await latestInviteToken() }))))
        .message,
    ).toBe('link_expired');
  });

  it('rate-limits redemption to 10 attempts per IP per 10 minutes', async () => {
    for (let i = 0; i < 10; i++) {
      await failure(redeemInviteHandler(request(null, { token: 'y'.repeat(43) }, '198.51.100.1')));
    }
    const eleventh = await failure(
      redeemInviteHandler(request(null, { token: 'y'.repeat(43) }, '198.51.100.1')),
    );
    expect(eleventh.code).toBe('resource-exhausted');
    // Another IP is unaffected.
    expect(
      (await failure(redeemInviteHandler(request(null, { token: 'y'.repeat(43) }, '198.51.100.2'))))
        .code,
    ).toBe('not-found');
  });

  it('tells the project staff when a client asks for a new link, and reveals nothing otherwise', async () => {
    const { owner, projectId } = await ownerWithProject();
    await inviteAnna(owner, projectId);
    const token = await latestInviteToken();
    await expect(requestNewLinkHandler(request(null, { token: 'z'.repeat(43) }))).resolves.toEqual({
      ok: true,
    });
    await requestNewLinkHandler(request(null, { token }));
    const emails = (await outbox()).filter((m) => m.template === 'newLinkRequested');
    expect(emails).toHaveLength(1);
    expect(emails[0]!.to.email).toBe('erik@example.com');
    expect(emails[0]!.params['link']).toBe(
      `http://localhost:4300/app/projects/${projectId}/people`,
    );
  });
});

import { createCompanyHandler } from '../../functions/src/callables/company';
import {
  acceptStaffInviteHandler,
  inviteStaffHandler,
  removeStaffHandler,
  setStaffRoleHandler,
} from '../../functions/src/callables/staff';
import {
  addStaff,
  auth,
  companyWithOwner,
  db,
  failure,
  outbox,
  refreshed,
  request,
  resetEmulators,
  signedInUser,
  tokenFromLink,
} from './harness';

beforeEach(resetEmulators);

const companyInput = {
  name: 'Ek & Lind Snickeri',
  orgNumber: '556016-0680',
  accentColor: '#127a69',
  locale: 'sv',
  ownerName: 'Erik Ek',
};

describe('createCompany', () => {
  it('creates the company, the owner membership and the owner claims', async () => {
    const erik = await signedInUser('erik', 'erik@example.com');
    const { companyId } = await createCompanyHandler(request(erik, companyInput));

    const company = (await db.doc(`companies/${companyId}`).get()).data()!;
    expect(company['name']).toBe('Ek & Lind Snickeri');
    expect(company['accentColor']).toBe('#127A69');
    expect(company['plan']).toBe('free');
    expect(company['usage'].staff).toBe(1);
    expect((await db.doc(`companies/${companyId}/staff/erik`).get()).get('role')).toBe('owner');
    expect((await db.doc('users/erik').get()).get('companyId')).toBe(companyId);
    expect((await auth.getUser('erik')).customClaims).toEqual({ cid: companyId, crole: 'owner' });
  });

  it('rejects a bad org number, people already in a company and clients', async () => {
    const erik = await signedInUser('erik', 'erik@example.com');
    expect(
      (
        await failure(
          createCompanyHandler(request(erik, { ...companyInput, orgNumber: '556016-0681' })),
        )
      ).code,
    ).toBe('invalid-argument');
    await createCompanyHandler(request(erik, companyInput));
    expect(
      (await failure(createCompanyHandler(request(await refreshed(erik), companyInput)))).message,
    ).toBe('already_in_company');
    const anna = await signedInUser('anna', null, { kind: 'client' });
    expect((await failure(createCompanyHandler(request(anna, companyInput)))).code).toBe(
      'permission-denied',
    );
  });
});

describe('staff invites', () => {
  it('invites by email, and the invite creates a staff membership with claims', async () => {
    const owner = await companyWithOwner('c1', 'erik', 'team');
    await inviteStaffHandler(
      request(owner, { name: 'Omar Haddad', email: 'omar@example.com', role: 'crew' }),
    );
    const [message] = await outbox();
    expect(message.template).toBe('staffInvite');
    expect(message.to.email).toBe('omar@example.com');

    const omar = await signedInUser('omar', 'omar@example.com');
    await acceptStaffInviteHandler(
      request(omar, { token: tokenFromLink(message.params['link']!) }),
    );
    expect((await auth.getUser('omar')).customClaims).toEqual({ cid: 'c1', crole: 'crew' });
    expect((await db.doc('companies/c1').get()).get('usage.staff')).toBe(2);

    // A staff link works once.
    const nils = await signedInUser('nils', 'nils@example.com');
    expect(
      (
        await failure(
          acceptStaffInviteHandler(
            request(nils, { token: tokenFromLink(message.params['link']!) }),
          ),
        )
      ).message,
    ).toBe('link_used');
  });

  it('enforces the staff limit of the plan', async () => {
    const owner = await companyWithOwner('c1', 'erik', 'free');
    const result = await failure(
      inviteStaffHandler(request(owner, { name: 'Omar', email: 'omar@example.com', role: 'crew' })),
    );
    expect(result).toEqual({ code: 'failed-precondition', message: 'plan_limit' });
  });

  it('lets only owners and admins invite', async () => {
    await companyWithOwner('c1', 'erik', 'team');
    const crew = await signedInUser('omar', 'omar@example.com', { cid: 'c1', crole: 'crew' });
    expect(
      (
        await failure(
          inviteStaffHandler(request(crew, { name: 'X', email: 'x@example.com', role: 'crew' })),
        )
      ).code,
    ).toBe('permission-denied');
  });
});

describe('roles and removal', () => {
  it('never lets the last owner be demoted or removed (PRD F1)', async () => {
    const owner = await companyWithOwner('c1', 'erik', 'team');
    expect(
      (await failure(setStaffRoleHandler(request(owner, { uid: 'erik', role: 'admin' })))).message,
    ).toBe('last_owner');
    expect((await failure(removeStaffHandler(request(owner, { uid: 'erik' })))).message).toBe(
      'last_owner',
    );
  });

  it('lets an owner hand over ownership, after which the old owner can step down', async () => {
    const owner = await companyWithOwner('c1', 'erik', 'team');
    await signedInUser('alva', 'alva@example.com', { cid: 'c1', crole: 'admin' });
    await addStaff('c1', 'alva', 'admin', 'Alva');
    await setStaffRoleHandler(request(owner, { uid: 'alva', role: 'owner' }));
    await setStaffRoleHandler(request(owner, { uid: 'erik', role: 'admin' }));
    expect((await auth.getUser('alva')).customClaims).toEqual({ cid: 'c1', crole: 'owner' });
    expect((await db.doc('users/alva').get()).get('claimsUpdatedAt')).toBeTruthy();
  });

  it('does not let admins grant ownership', async () => {
    await companyWithOwner('c1', 'erik', 'team');
    const admin = await signedInUser('alva', 'alva@example.com', { cid: 'c1', crole: 'admin' });
    await addStaff('c1', 'alva', 'admin', 'Alva');
    expect(
      (await failure(setStaffRoleHandler(request(admin, { uid: 'alva', role: 'owner' })))).message,
    ).toBe('owners_only');
  });

  it('removes a staff member from the company and their projects and clears their claims', async () => {
    const owner = await companyWithOwner('c1', 'erik', 'team', { staff: 2 });
    await signedInUser('omar', 'omar@example.com', { cid: 'c1', crole: 'crew' });
    await addStaff('c1', 'omar', 'crew', 'Omar');
    await db
      .doc('projects/p1')
      .set({ companyId: 'c1', crewUids: ['omar'], roles: { omar: 'crew' } });
    await db.doc('projects/p1/members/omar').set({ role: 'crew' });

    await removeStaffHandler(request(owner, { uid: 'omar' }));
    expect((await db.doc('projects/p1').get()).data()).toMatchObject({ crewUids: [], roles: {} });
    expect((await db.doc('projects/p1/members/omar').get()).exists).toBe(false);
    expect((await auth.getUser('omar')).customClaims).toEqual({});
    expect((await db.doc('companies/c1').get()).get('usage.staff')).toBe(1);
  });
});

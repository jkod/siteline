import {
  createCompanyInput,
  createProjectInput,
  inviteClientInput,
  inviteStaffInput,
} from './callables';

describe('callable schemas', () => {
  it('normalises an invited client phone to E.164 and an empty email to null', () => {
    const parsed = inviteClientInput.parse({
      projectId: 'p1',
      name: ' Anna Lindqvist ',
      phone: '070-174 06 05',
      email: '',
    });
    expect(parsed).toEqual({
      projectId: 'p1',
      name: 'Anna Lindqvist',
      phone: '+46701740605',
      email: null,
    });
  });

  it('checks the org number with Luhn and accepts an empty one', () => {
    const base = { name: 'Ek & Lind', accentColor: '#127A69', locale: 'sv', ownerName: 'Erik' };
    expect(createCompanyInput.parse({ ...base, orgNumber: '' }).orgNumber).toBeNull();
    expect(createCompanyInput.safeParse({ ...base, orgNumber: '556016-0681' }).success).toBe(false);
    expect(createCompanyInput.parse({ ...base, orgNumber: '556016-0680' }).orgNumber).toBe(
      '556016-0680',
    );
  });

  it('requires an email or phone for a staff invite', () => {
    expect(inviteStaffInput.safeParse({ name: 'Omar', role: 'crew' }).success).toBe(false);
    expect(inviteStaffInput.parse({ name: 'Omar', role: 'crew', phone: '0701740611' }).phone).toBe(
      '+46701740611',
    );
  });

  it('rejects an end date before the start date', () => {
    expect(
      createProjectInput.safeParse({ title: 'Kök', startDate: '2026-11-02', endDate: '2026-11-01' })
        .success,
    ).toBe(false);
  });
});

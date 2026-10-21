import type { Auth } from 'firebase-admin/auth';

import { clearStaffClaims, setStaffClaims } from './claims';

function fakeAuth(customClaims: Record<string, unknown>) {
  const setCustomUserClaims = vi.fn().mockResolvedValue(undefined);
  const auth = {
    getUser: vi.fn().mockResolvedValue({ customClaims }),
    setCustomUserClaims,
  } as unknown as Auth;
  return { auth, setCustomUserClaims };
}

describe('setStaffClaims', () => {
  it('sets cid and crole and keeps other claims', async () => {
    const { auth, setCustomUserClaims } = fakeAuth({ other: true, crole: 'crew' });
    await setStaffClaims(auth, 'u1', { cid: 'c1', crole: 'admin' });
    expect(setCustomUserClaims).toHaveBeenCalledWith('u1', {
      other: true,
      cid: 'c1',
      crole: 'admin',
    });
  });

  it('rejects an unknown role', async () => {
    const { auth, setCustomUserClaims } = fakeAuth({});
    await expect(
      setStaffClaims(auth, 'u1', { cid: 'c1', crole: 'boss' as never }),
    ).rejects.toThrow();
    expect(setCustomUserClaims).not.toHaveBeenCalled();
  });
});

describe('clearStaffClaims', () => {
  it('removes only the staff claims', async () => {
    const { auth, setCustomUserClaims } = fakeAuth({ cid: 'c1', crole: 'owner', other: 1 });
    await clearStaffClaims(auth, 'u1');
    expect(setCustomUserClaims).toHaveBeenCalledWith('u1', { other: 1 });
  });
});

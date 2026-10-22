import { forgetReferralCode, pendingReferralCode, rememberReferralCode } from './referral-code';

describe('referral code', () => {
  beforeEach(() => localStorage.clear());

  it('is kept for 30 days, then dropped', () => {
    rememberReferralCode('ABCDEFGH23', 1_000);
    expect(pendingReferralCode(1_000 + 29 * 86_400_000)).toBe('ABCDEFGH23');
    expect(pendingReferralCode(1_000 + 30 * 86_400_000)).toBeNull();
  });

  it('is forgotten after sign-up, and ignores anything malformed', () => {
    rememberReferralCode('ABCDEFGH23');
    forgetReferralCode();
    expect(pendingReferralCode()).toBeNull();
    localStorage.setItem('sl.referral', '{"code":42}');
    expect(pendingReferralCode()).toBeNull();
    localStorage.setItem('sl.referral', 'not json');
    expect(pendingReferralCode()).toBeNull();
  });
});

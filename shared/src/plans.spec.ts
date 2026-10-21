import { effectiveLimits, PLAN_LIMITS, PLANS, showsSitelineFooter } from './plans';

describe('plans', () => {
  it('defines limits for every plan', () => {
    for (const plan of PLANS) {
      expect(PLAN_LIMITS[plan]).toBeDefined();
    }
  });

  it('shows the footer only on Free and Visits', () => {
    expect(PLANS.filter(showsSitelineFooter)).toEqual(['free', 'visits']);
  });
});

describe('effectiveLimits', () => {
  const free = { limits: PLAN_LIMITS.free, compedUntil: null };
  const ms = (n: number) => ({ toMillis: () => n });

  it('uses the stored limits without a comp', () => {
    expect(effectiveLimits(free, 1000)).toEqual(PLAN_LIMITS.free);
  });

  it('gives design partners Team limits until compedUntil', () => {
    expect(effectiveLimits({ ...free, compedUntil: ms(2000) }, 1000)).toEqual(PLAN_LIMITS.team);
    expect(effectiveLimits({ ...free, compedUntil: ms(500) }, 1000)).toEqual(PLAN_LIMITS.free);
  });
});

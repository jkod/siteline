import {
  effectiveLimits,
  effectivePlan,
  PLAN_LIMITS,
  planFeatures,
  planPriceOre,
  PLANS,
  showsSitelineFooter,
} from './plans';

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

describe('planFeatures', () => {
  it('gives the logo from Solo, the colour and aftercare from Team, and the footer on Free and Visits', () => {
    expect(planFeatures('free')).toEqual({
      logo: false,
      colours: false,
      conditionCheckIn: false,
      aftercare: false,
      footer: true,
    });
    expect(planFeatures('visits')).toEqual({
      logo: false,
      colours: false,
      conditionCheckIn: false,
      aftercare: false,
      footer: true,
    });
    expect(planFeatures('solo')).toEqual({
      logo: true,
      colours: false,
      conditionCheckIn: true,
      aftercare: false,
      footer: false,
    });
    expect(planFeatures('team')).toEqual({
      logo: true,
      colours: true,
      conditionCheckIn: true,
      aftercare: true,
      footer: false,
    });
    expect(planFeatures('pro').colours).toBe(true);
  });
});

describe('effectivePlan', () => {
  const until = (ms: number) => ({ toMillis: () => ms });
  it('lifts comped companies to Team until the date, and never lowers a plan', () => {
    expect(effectivePlan({ plan: 'free', compedUntil: until(2000) }, 1000)).toBe('team');
    expect(effectivePlan({ plan: 'free', compedUntil: until(500) }, 1000)).toBe('free');
    expect(effectivePlan({ plan: 'pro', compedUntil: until(2000) }, 1000)).toBe('pro');
    expect(effectivePlan({ plan: 'solo', compedUntil: null }, 1000)).toBe('solo');
  });
});

describe('planPriceOre', () => {
  it('charges ten months for a year', () => {
    expect(planPriceOre('solo', 'month')).toBe(29_900);
    expect(planPriceOre('solo', 'year')).toBe(299_000);
  });
});

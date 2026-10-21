import { PLAN_LIMITS, PLANS, showsSitelineFooter } from './plans';

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

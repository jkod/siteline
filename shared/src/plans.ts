export const PLANS = ['free', 'visits', 'solo', 'team', 'pro'] as const;
export type Plan = (typeof PLANS)[number];

export interface PlanLimits {
  /** `null` means unlimited. */
  activeProjects: number | null;
  serviceClients: number | null;
  staff: number | null;
  smsPerMonth: number;
}

/** Monthly price in öre, excluding VAT (PRD F10). */
export const PLAN_PRICE_ORE: Record<Plan, number> = {
  free: 0,
  visits: 9_900,
  solo: 29_900,
  team: 79_000,
  pro: 169_000,
};

/**
 * Limits per plan (PRD F10). Text budgets are the proposal in PRD section 16; the Visits
 * budget isn't in the PRD and is a placeholder until pilot usage is known.
 */
export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { activeProjects: 1, serviceClients: 3, staff: 1, smsPerMonth: 30 },
  visits: { activeProjects: 1, serviceClients: 20, staff: 1, smsPerMonth: 150 },
  solo: { activeProjects: 5, serviceClients: 20, staff: 1, smsPerMonth: 300 },
  team: { activeProjects: 25, serviceClients: 100, staff: 10, smsPerMonth: 1_500 },
  pro: { activeProjects: null, serviceClients: null, staff: null, smsPerMonth: 5_000 },
};

/** Plans that show the "Updates by Siteline" footer in the client view. */
export function showsSitelineFooter(plan: Plan): boolean {
  return plan === 'free' || plan === 'visits';
}

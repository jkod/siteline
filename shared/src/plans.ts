import { DEFAULT_ACCENT } from './constants';
import type { TimestampLike } from './model';

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
  return planFeatures(plan).footer;
}

/**
 * The limits that apply now: design partners with a future `compedUntil` get Team limits for
 * free (PRD F10), otherwise the stored limits for the plan.
 */
export function effectiveLimits(
  company: { limits: PlanLimits; compedUntil: { toMillis(): number } | null },
  nowMs: number,
): PlanLimits {
  if (company.compedUntil && company.compedUntil.toMillis() > nowMs) {
    const team = PLAN_LIMITS.team;
    const pick = (a: number | null, b: number | null) =>
      a === null || b === null ? null : Math.max(a, b);
    return {
      activeProjects: pick(company.limits.activeProjects, team.activeProjects),
      serviceClients: pick(company.limits.serviceClients, team.serviceClients),
      staff: pick(company.limits.staff, team.staff),
      smsPerMonth: Math.max(company.limits.smsPerMonth, team.smsPerMonth),
    };
  }
  return company.limits;
}

const RANK: Record<Plan, number> = { free: 0, visits: 1, solo: 2, team: 3, pro: 4 };

/** The plan whose features apply now: design partners get at least Team until compedUntil. */
export function effectivePlan(
  company: { plan: Plan; compedUntil: { toMillis(): number } | null },
  nowMs: number,
): Plan {
  const comped = !!company.compedUntil && company.compedUntil.toMillis() > nowMs;
  return comped && RANK[company.plan] < RANK.team ? 'team' : company.plan;
}

export interface PlanFeatures {
  /** The firm's logo in the client view (from Solo, the user's choice over the PRD table). */
  logo: boolean;
  /** The firm's colour in the client view (Team and up). */
  colours: boolean;
  /** Condition check-in, F12 (Solo and up). */
  conditionCheckIn: boolean;
  /** Aftercare reminders, F13 (Team and up). */
  aftercare: boolean;
  /** The "Updates by Siteline" footer (Free and Visits). */
  footer: boolean;
}

/** What a plan includes (PRD F10). */
export function planFeatures(plan: Plan): PlanFeatures {
  const rank = RANK[plan];
  return {
    logo: rank >= RANK.solo,
    colours: rank >= RANK.team,
    conditionCheckIn: rank >= RANK.solo,
    aftercare: rank >= RANK.team,
    footer: rank <= RANK.visits,
  };
}

/** Plans that can be bought, in order. */
export const PAID_PLANS = ['visits', 'solo', 'team', 'pro'] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];
export type BillingInterval = 'month' | 'year';

/** Annual billing gives two months free (PRD F10). */
export function planPriceOre(plan: Plan, interval: BillingInterval): number {
  return interval === 'year' ? PLAN_PRICE_ORE[plan] * 10 : PLAN_PRICE_ORE[plan];
}

export const VAT_RATE_SUBSCRIPTIONS = 0.25;

/** A company's subscription, kept by the billing webhook (owners only). */
export interface BillingInfo<T = TimestampLike> {
  customerId: string | null;
  subscriptionId: string | null;
  status: 'none' | 'active' | 'past_due' | 'canceled';
  plan: Plan;
  interval: BillingInterval | null;
  currentPeriodEnd: T | null;
  /** Free months earned from client invites, waiting for a subscription to credit (F20). */
  pendingFreeMonths: number;
  updatedAt: T;
}

/**
 * The branding copied onto a company's projects, as its plan allows (PRD F3, F10): the logo
 * from Solo, the colour from Team, and the footer on Free and Visits.
 */
export function projectBranding(
  company: {
    name: string;
    accentColor: string;
    plan: Plan;
    compedUntil: { toMillis(): number } | null;
  },
  logoUrl: string | null,
  nowMs: number,
): { name: string; logoUrl: string | null; accentColor: string; showSitelineFooter: boolean } {
  const features = planFeatures(effectivePlan(company, nowMs));
  return {
    name: company.name,
    logoUrl: features.logo ? logoUrl : null,
    accentColor: features.colours ? company.accentColor : DEFAULT_ACCENT,
    showSitelineFooter: features.footer,
  };
}

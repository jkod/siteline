import type { ApprovalRule, Decision, DecisionStatus } from './model';
import { formatMoney } from './money';

/** States a decision never leaves (PRD 4.3). */
export const FINAL_DECISION_STATUSES: DecisionStatus[] = [
  'approved',
  'declined',
  'withdrawn',
  'superseded',
];

/** The money a decision involves: its price, or the largest option price difference. */
export function decisionHasPrice(
  decision: Pick<Decision, 'kind' | 'priceOre' | 'options'>,
): boolean {
  if (decision.kind === 'extra_work') return (decision.priceOre ?? 0) !== 0;
  if (decision.kind === 'choice')
    return (decision.options ?? []).some((o) => (o.priceDeltaOre ?? 0) !== 0);
  return false;
}

/** The total of approved extra work (PRD F6): the sum of the approved extra-work versions. */
export function approvedExtraWorkTotal(
  decisions: Pick<Decision, 'kind' | 'status' | 'priceOre'>[],
): number {
  return decisions
    .filter((d) => d.kind === 'extra_work' && d.status === 'approved')
    .reduce((sum, d) => sum + (d.priceOre ?? 0), 0);
}

/** The price a client agreed to: the extra-work price, or the chosen option's difference. */
export function agreedPrice(
  decision: Pick<Decision, 'kind' | 'priceOre' | 'options'>,
  optionId: string | null,
): number | null {
  if (decision.kind === 'extra_work') return decision.priceOre ?? null;
  if (decision.kind === 'choice')
    return decision.options?.find((o) => o.id === optionId)?.priceDeltaOre ?? null;
  return null;
}

export interface DecisionCsvRow {
  title: string;
  kind: string;
  status: string;
  version: number;
  priceOre: number | null;
  sentAt: Date | null;
  decidedAt: Date | null;
  decidedBy: string;
  choice: string;
  reason: string;
}

function cell(value: string): string {
  return /[;"\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * All decisions as CSV for staff (PRD F6), with semicolons as separators so Swedish Excel opens
 * it directly, and a BOM so å, ä and ö show correctly.
 */
export function decisionsCsv(rows: DecisionCsvRow[]): string {
  const header = [
    'Rubrik',
    'Typ',
    'Status',
    'Version',
    'Pris',
    'Skickad',
    'Beslutad',
    'Beslutad av',
    'Val',
    'Anledning',
  ];
  const iso = (d: Date | null) => (d ? d.toISOString() : '');
  const lines = rows.map((r) =>
    [
      r.title,
      r.kind,
      r.status,
      String(r.version),
      r.priceOre === null ? '' : formatMoney(r.priceOre, 'sv', { plain: true }),
      iso(r.sentAt),
      iso(r.decidedAt),
      r.decidedBy,
      r.choice,
      r.reason,
    ]
      .map(cell)
      .join(';'),
  );
  return `\uFEFF${[header.join(';'), ...lines].join('\r\n')}\r\n`;
}

/**
 * Who must approve a decision being sent: every current client when the project requires all
 * of them and the decision has a price, otherwise null (any one client decides).
 */
export function requiredApprovers(
  rule: ApprovalRule | undefined,
  decision: Pick<Decision, 'kind' | 'priceOre' | 'options'>,
  clientUids: string[],
): string[] | null {
  return rule === 'all' && clientUids.length > 1 && decisionHasPrice(decision)
    ? [...clientUids]
    : null;
}

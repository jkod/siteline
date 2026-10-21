import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/https';
import {
  agreedPrice,
  approvedExtraWorkTotal,
  type Company,
  type Decision,
  type DecisionFields,
  decisionHasPrice,
  formatMoney,
  type Locale,
  type Post,
  type Project,
  VAT_RATE,
} from '@siteline/shared';

import type { StaffCaller } from './context';
import { sha256Hex } from './crypto';

/**
 * Who may send a card: owners and admins always; crew too, unless the card involves money and
 * the company hasn't turned on crewCanSendPricedCards (PRD section 2).
 */
export function assertCanSend(
  caller: StaffCaller,
  company: Company,
  decision: Pick<Decision, 'kind' | 'priceOre' | 'options'>,
): void {
  if (caller.role !== 'crew') return;
  if (decisionHasPrice(decision) && !company.settings.crewCanSendPricedCards) {
    throw new HttpsError('permission-denied', 'crew_cannot_send_priced');
  }
}

/** The card's fields from callable input, without undefined values (Firestore rejects them). */
export function decisionFields(
  input: DecisionFields,
): Omit<Decision, 'status' | 'version' | 'createdByUid'> {
  const fields: Omit<Decision, 'status' | 'version' | 'createdByUid'> = {
    kind: input.kind,
    title: input.title.trim(),
    vatRate: VAT_RATE,
  };
  if (input.description) fields.description = input.description.trim();
  if (input.kind === 'extra_work') {
    fields.priceOre = input.priceOre ?? 0;
    if (input.labourOre !== undefined) fields.labourOre = input.labourOre;
    if (input.materialOre !== undefined) fields.materialOre = input.materialOre;
  }
  if (input.kind === 'choice') {
    fields.options = (input.options ?? []).map((o) => {
      const option: NonNullable<Decision['options']>[number] = { id: o.id, label: o.label.trim() };
      if (o.priceDeltaOre) option.priceDeltaOre = o.priceDeltaOre;
      return option;
    });
  }
  return fields;
}

/** JSON with sorted keys, so the same content always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    if ('toDate' in value && typeof (value as { toDate: unknown }).toDate === 'function') {
      return JSON.stringify((value as { toDate(): Date }).toDate().toISOString());
    }
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Exactly what the client saw and answered, and its SHA-256 (PRD F6). */
export function decisionSnapshot(
  post: Post,
  projectTitle: string,
): { snapshot: Record<string, unknown>; sha256: string } {
  const d = post.decision!;
  const snapshot: Record<string, unknown> = {
    project: projectTitle,
    kind: d.kind,
    title: d.title,
    description: d.description ?? null,
    priceOre: d.priceOre ?? null,
    labourOre: d.labourOre ?? null,
    materialOre: d.materialOre ?? null,
    vatRate: d.vatRate,
    options: d.options ?? null,
    respondBy: d.respondBy ?? null,
    version: d.version,
    sentAt: d.sentAt ?? null,
    media: post.media.map((m) => m.path),
  };
  return { snapshot, sha256: sha256Hex(canonicalJson(snapshot)) };
}

/** Recounts open decisions and the approved extra-work total (idempotent, PRD F6). */
export async function recountDecisions(db: Firestore, projectId: string): Promise<void> {
  const posts = await db
    .collection(`projects/${projectId}/posts`)
    .where('type', '==', 'decision')
    .get();
  const decisions = posts.docs.map((d) => (d.data() as Post).decision!).filter(Boolean);
  await db.doc(`projects/${projectId}`).update({
    'totals.openDecisions': decisions.filter((d) => d.status === 'sent').length,
    'totals.approvedExtraWorkOre': approvedExtraWorkTotal(decisions),
  });
}

/** The price line in messages, such as "6 500 kr", or empty. */
export function priceLine(decision: Decision, locale: Locale): string {
  const price = agreedPrice(decision, null);
  return price ? formatMoney(price, locale, { plain: true }) : '';
}

export function projectOrThrow(project: Project | undefined): Project {
  if (!project) throw new HttpsError('not-found', 'project_not_found');
  return project;
}

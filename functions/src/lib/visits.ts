import { FieldValue, type Firestore, Timestamp } from 'firebase-admin/firestore';
import {
  occurrences,
  type Project,
  stockholmDate,
  stockholmDayRange,
  type Visit,
} from '@siteline/shared';

export const GENERATE_WEEKS = 8;

/** Visit IDs for scheduled visits are their date, so a moved or cancelled one is never recreated. */
export function scheduledVisitId(date: string): string {
  return `s-${date}`;
}

/**
 * Creates the schedule's visits up to eight weeks ahead (PRD F19). Existing visits, including
 * moved and cancelled ones, are left alone, and skipped dates produce no visit.
 */
export async function generateVisitsForProject(
  db: Firestore,
  projectId: string,
  project: Pick<Project, 'companyId' | 'schedule'>,
  now = new Date(),
): Promise<number> {
  if (!project.schedule) return 0;
  const until = new Date(now.getTime() + GENERATE_WEEKS * 7 * 86_400_000);
  const planned = occurrences(project.schedule, now, until);
  const visits = db.collection(`projects/${projectId}/visits`);
  const existing = await db.getAll(...planned.map((o) => visits.doc(scheduledVisitId(o.date))));
  const missing = planned.filter((_, i) => !existing[i]!.exists);
  if (missing.length === 0) return 0;
  const batch = db.batch();
  for (const o of missing) {
    const visit: Visit<Timestamp | FieldValue> = {
      companyId: project.companyId,
      startAt: Timestamp.fromDate(o.startAt),
      endAt: Timestamp.fromDate(o.endAt),
      people: null,
      notes: '',
      status: 'planned',
      fromSchedule: true,
      reportPostId: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    batch.create(visits.doc(scheduledVisitId(o.date)), visit);
  }
  await batch.commit();
  return missing.length;
}

/** The next visit: the earliest planned one from today on (PRD F7), optionally skipping one. */
export async function nextPlannedVisit(
  db: Firestore,
  projectId: string,
  now = new Date(),
  excludeId?: string,
) {
  const today = stockholmDayRange(stockholmDate(now)).start;
  const snapshot = await db
    .collection(`projects/${projectId}/visits`)
    .where('status', '==', 'planned')
    .where('startAt', '>=', Timestamp.fromDate(today))
    .orderBy('startAt')
    .limit(2)
    .get();
  return snapshot.docs.find((d) => d.id !== excludeId) ?? null;
}

/** Keeps project.nextVisitId current and gives unbooked checklist items to the next visit. */
export async function refreshNextVisit(
  db: Firestore,
  projectId: string,
  now = new Date(),
): Promise<string | null> {
  const next = await nextPlannedVisit(db, projectId, now);
  const nextId = next?.id ?? null;
  const projectRef = db.doc(`projects/${projectId}`);
  if ((await projectRef.get()).get('nextVisitId') !== nextId)
    await projectRef.update({ nextVisitId: nextId });
  if (nextId) {
    const unbooked = await db
      .collection(`projects/${projectId}/checklist`)
      .where('visitId', '==', null)
      .get();
    const batch = db.batch();
    for (const item of unbooked.docs)
      if (!item.get('doneAt')) batch.update(item.ref, { visitId: nextId });
    if (!unbooked.empty) await batch.commit();
  }
  return nextId;
}

/** When a visit is done, its unfinished items move to the next visit (PRD F7). */
export async function moveUnfinishedItems(
  db: Firestore,
  projectId: string,
  fromVisitId: string,
  now = new Date(),
): Promise<void> {
  const next = await nextPlannedVisit(db, projectId, now);
  const open = await db
    .collection(`projects/${projectId}/checklist`)
    .where('visitId', '==', fromVisitId)
    .where('doneAt', '==', null)
    .get();
  if (open.empty) return;
  const batch = db.batch();
  for (const item of open.docs) batch.update(item.ref, { visitId: next?.id ?? null });
  await batch.commit();
}

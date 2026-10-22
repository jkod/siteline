import type { Firestore, QuerySnapshot } from 'firebase/firestore';
import type { Visit } from '@siteline/shared';

import type { WithId } from '../core/live';

export interface PlannedVisit extends WithId<Visit> {
  projectId: string;
}

type FirestoreModule = typeof import('firebase/firestore');

/**
 * Watches planned visits starting before `until`, oldest first. Owners and admins load the
 * whole company's in one collection-group query; crew per assigned project, since the rules let
 * crew read only their own projects. Returns the unsubscribe function.
 */
export function watchPlannedVisits(
  db: Firestore,
  fs: FirestoreModule,
  scope: { companyId: string; isCrew: boolean; projectIds: string[] },
  until: Date,
  onVisits: (visits: PlannedVisit[]) => void,
): () => void {
  const toRows = (snap: QuerySnapshot) =>
    snap.docs.map((d) => ({
      id: d.id,
      projectId: d.ref.parent.parent!.id,
      ...(d.data() as Visit),
    }));
  const before = fs.where('startAt', '<', fs.Timestamp.fromDate(until));
  if (!scope.isCrew) {
    return fs.onSnapshot(
      fs.query(
        fs.collectionGroup(db, 'visits'),
        fs.where('companyId', '==', scope.companyId),
        fs.where('status', '==', 'planned'),
        before,
        fs.orderBy('startAt'),
      ),
      (snap) => onVisits(toRows(snap)),
      () => onVisits([]),
    );
  }
  const perProject = new Map<string, PlannedVisit[]>();
  const unsubscribe = scope.projectIds.map((id) =>
    fs.onSnapshot(
      fs.query(
        fs.collection(db, 'projects', id, 'visits'),
        fs.where('status', '==', 'planned'),
        before,
        fs.orderBy('startAt'),
      ),
      (snap) => {
        perProject.set(id, toRows(snap));
        onVisits(
          [...perProject.values()]
            .flat()
            .sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis()),
        );
      },
    ),
  );
  return () => unsubscribe.forEach((u) => u());
}

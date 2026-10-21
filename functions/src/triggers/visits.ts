import type { DocumentSnapshot, Firestore, Timestamp } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/firestore';
import type { Project, UserDoc, Visit } from '@siteline/shared';

import { db } from '../lib/admin';
import { appUrl } from '../lib/env';
import { visitWhen } from '../lib/format';
import { queueMessage } from '../lib/outbox';
import { moveUnfinishedItems, refreshNextVisit } from '../lib/visits';

/**
 * Keeps the next visit current, moves unfinished items on when a visit is done, and tells
 * clients at once when a visit is added, moved or cancelled (PRD F7, section 6). Visits the
 * schedule creates in bulk don't notify; the client sees them in the app.
 */
export async function handleVisitWritten(
  firestore: Firestore,
  projectId: string,
  visitId: string,
  before: DocumentSnapshot | undefined,
  after: DocumentSnapshot | undefined,
  now = new Date(),
): Promise<void> {
  const previous = before?.exists ? (before.data() as Visit<Timestamp>) : null;
  const current = after?.exists ? (after.data() as Visit<Timestamp>) : null;

  if (current?.status === 'done' && previous?.status !== 'done') {
    await moveUnfinishedItems(firestore, projectId, visitId, now);
  }
  await refreshNextVisit(firestore, projectId, now);
  if (!current) return;

  const added = !previous && !current.fromSchedule;
  const moved =
    !!previous &&
    previous.startAt.toMillis() !== current.startAt.toMillis() &&
    current.status === 'planned';
  const cancelled = !!previous && previous.status !== 'cancelled' && current.status === 'cancelled';
  if (!added && !moved && !cancelled) return;
  if (current.startAt.toMillis() < now.getTime()) return;

  const project = (await firestore.doc(`projects/${projectId}`).get()).data() as
    Project | undefined;
  if (!project) return;
  for (const uid of project.clientUids) {
    const user = (await firestore.doc(`users/${uid}`).get()).data() as UserDoc | undefined;
    if (!user?.phoneE164 && !user?.email) continue;
    await queueMessage(
      firestore,
      {
        channel: user.phoneE164 ? 'sms' : 'email',
        to: { uid, phone: user.phoneE164, email: user.email },
        recipientKind: 'client',
        template: cancelled ? 'visitCancelled' : 'visitChanged',
        params: {
          firm: project.branding.name,
          project: project.title,
          when: visitWhen(
            (cancelled && previous ? previous : current).startAt.toDate(),
            user.locale,
          ),
          link: `${appUrl.value()}/c/${projectId}/visit`,
          settingsPath: '/c/settings',
        },
        locale: user.locale,
        companyId: project.companyId,
        projectId,
        dedupeKey: `visit:${visitId}:${current.status}:${current.startAt.toMillis()}:${uid}`,
      },
      now,
    );
  }
}

export const onVisitWritten = onDocumentWritten('projects/{projectId}/visits/{visitId}', (event) =>
  handleVisitWritten(
    db,
    event.params.projectId,
    event.params.visitId,
    event.data?.before,
    event.data?.after,
  ),
);

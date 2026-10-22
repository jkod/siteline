import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import type { MetricEvent } from '@siteline/shared';

type EventInput = Omit<MetricEvent, 'at' | 'companyId' | 'projectId' | 'uid' | 'role' | 'props'> &
  Partial<Pick<MetricEvent, 'companyId' | 'projectId' | 'uid' | 'role' | 'props'>>;

/**
 * Records a first-party product event (PRD section 8). Metrics never block the action they
 * measure, so a failed write is logged and swallowed.
 */
export async function recordEvent(firestore: Firestore, event: EventInput): Promise<void> {
  try {
    await firestore.collection('events').add({
      companyId: null,
      projectId: null,
      uid: null,
      role: null,
      props: {},
      ...event,
      at: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    logger.warn('Could not record event', { name: event.name, error: String(error) });
  }
}

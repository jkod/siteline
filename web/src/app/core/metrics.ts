import { inject, Injectable } from '@angular/core';

import type { CLIENT_METRICS } from '@siteline/shared';

import { FirebaseService } from './firebase';
import { Session } from './session';

/**
 * Whether product events wait for the person's consent. The PRD leaves this to counsel
 * (section 16); until then events are first-party only, with no banner.
 */
export const METRICS_NEED_CONSENT = false;

export type ClientMetric = (typeof CLIENT_METRICS)[number];

/**
 * First-party product events (PRD section 8), written to our own Firestore under rules. Props
 * hold counts and kinds only, never names, numbers or text. Tracking never gets in the way:
 * failures are ignored.
 */
@Injectable({ providedIn: 'root' })
export class Metrics {
  private readonly firebase = inject(FirebaseService);
  private readonly session = inject(Session);

  track(
    name: ClientMetric,
    where: { projectId?: string | null; companyId?: string | null } = {},
    props: Record<string, string | number | boolean> = {},
  ): void {
    const uid = this.session.user()?.uid;
    if (!uid || METRICS_NEED_CONSENT) return;
    const claims = this.session.claims();
    void Promise.all([this.firebase.firestore(), import('firebase/firestore')])
      .then(([db, fs]) =>
        fs.addDoc(fs.collection(db, 'events'), {
          name,
          companyId: where.projectId ? (where.companyId ?? null) : claims.cid,
          projectId: where.projectId ?? null,
          uid,
          role: claims.isClient ? 'client' : claims.crole,
          props,
          at: fs.serverTimestamp(),
        }),
      )
      .catch(() => undefined);
  }
}

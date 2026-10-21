import { computed, inject, Injectable, resource } from '@angular/core';

import { FirebaseService } from '../core/firebase';
import { Session } from '../core/session';

export interface CompanySummary {
  name: string;
  plan: string;
}

/** The signed-in staff member's company, read under the rules (staff of the company only). */
@Injectable({ providedIn: 'root' })
export class CurrentCompany {
  private readonly firebase = inject(FirebaseService);
  private readonly session = inject(Session);

  private readonly company = resource({
    params: () => this.session.claims().cid ?? undefined,
    loader: async ({ params: companyId }): Promise<CompanySummary | null> => {
      const [db, { doc, getDoc }] = await Promise.all([
        this.firebase.firestore(),
        import('firebase/firestore'),
      ]);
      const snapshot = await getDoc(doc(db, 'companies', companyId));
      const data = snapshot.data();
      return data
        ? { name: String(data['name'] ?? ''), plan: String(data['plan'] ?? 'free') }
        : null;
    },
  });

  readonly value = computed(() => (this.company.hasValue() ? this.company.value() : null));
  readonly name = computed(() => this.value()?.name ?? '');
}

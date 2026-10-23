import { computed, inject, Injectable } from '@angular/core';

import {
  type Company,
  effectiveLimits,
  effectivePlan,
  planFeatures,
  type Project,
  type StaffMember,
} from '@siteline/shared';

import { liveDoc, liveQuery } from '../core/live';
import { Session } from '../core/session';

/**
 * The signed-in staff member's company, its staff and the projects they can see, live. Owners
 * and admins see every project; crew only those they're assigned to (PRD F2).
 */
@Injectable({ providedIn: 'root' })
export class CurrentCompany {
  private readonly session = inject(Session);
  private readonly companyId = computed(() => this.session.claims().cid);

  readonly company = liveDoc<Company>(() =>
    this.companyId() ? `companies/${this.companyId()}` : null,
  );
  readonly name = computed(() => this.company()?.name ?? '');
  readonly limits = computed(() => {
    const company = this.company();
    return company ? effectiveLimits(company, Date.now()) : null;
  });

  /** The plan whose features apply now: design partners get Team (PRD F10). */
  readonly plan = computed(() => {
    const company = this.company();
    return company ? effectivePlan(company, Date.now()) : 'free';
  });
  readonly features = computed(() => planFeatures(this.plan()));

  readonly staff = liveQuery<StaffMember>(
    (db, fs) => {
      const cid = this.companyId();
      return cid
        ? fs.query(fs.collection(db, 'companies', cid, 'staff'), fs.orderBy('name'))
        : null;
    },
    () => this.companyId(),
  );

  readonly projects = liveQuery<Project>(
    (db, fs) => {
      const cid = this.companyId();
      const uid = this.session.user()?.uid;
      if (!cid || !uid) return null;
      const base = fs.collection(db, 'projects');
      return this.session.role() === 'crew'
        ? fs.query(
            base,
            fs.where('companyId', '==', cid),
            fs.where('crewUids', 'array-contains', uid),
            fs.orderBy('lastPostAt', 'desc'),
          )
        : fs.query(base, fs.where('companyId', '==', cid), fs.orderBy('lastPostAt', 'desc'));
    },
    () => [this.companyId(), this.session.user()?.uid, this.session.role()],
  );

  readonly activeProjects = computed(() =>
    (this.projects() ?? []).filter((p) => p.status === 'active'),
  );
}

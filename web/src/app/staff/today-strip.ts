import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TranslatePipe } from '@ngx-translate/core';
import { stockholmDate, stockholmDayRange } from '@siteline/shared';

import { FirebaseService } from '../core/firebase';
import { Session } from '../core/session';
import { DatePipe } from '../shared/pipes/date';
import { Button } from '../shared/ui/button';
import { CurrentCompany } from './current-company';
import { type PlannedVisit, watchPlannedVisits } from './planned-visits';

/**
 * Today's visits, with a Report button on each (PRD F19). Earlier visits without a report stay
 * here until reported or cancelled.
 */
@Component({
  selector: 'sl-today-strip',
  imports: [TranslatePipe, RouterLink, DatePipe, Button],
  template: `
    @if (rows().length) {
      <section class="strip" aria-labelledby="today-title">
        <h2 id="today-title">{{ 'today.title' | translate }}</h2>
        <ul>
          @for (row of rows(); track row.id) {
            <li>
              <span class="time" [class.missed]="row.missed">
                {{
                  row.missed ? (row.startAt | slDate: 'visitDay') : (row.startAt | slDate: 'time')
                }}
              </span>
              <span class="title">
                {{ row.title }}
                @if (row.missed) {
                  <span class="sl-badge">{{ 'today.notReported' | translate }}</span>
                }
              </span>
              @if (row.service) {
                <a
                  slButton
                  [routerLink]="['/app/projects', row.projectId, 'visit']"
                  [queryParams]="{ report: row.id }"
                  >{{ 'visits.report' | translate }}</a
                >
              } @else {
                <a slButton="secondary" [routerLink]="['/app/projects', row.projectId, 'visit']">{{
                  'today.open' | translate
                }}</a>
              }
            </li>
          }
        </ul>
      </section>
    }
  `,
  styles: `
    .strip {
      display: flex;
      flex-direction: column;
      gap: var(--sl-space-3);
      padding: var(--sl-space-4) var(--sl-space-5);
      background: var(--sl-dark);
      color: #fff;
      border-radius: var(--sl-radius-card);
    }
    h2 {
      font: var(--sl-text-section);
    }
    ul {
      display: flex;
      flex-direction: column;
      gap: var(--sl-space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: flex;
      align-items: center;
      gap: var(--sl-space-3);
      padding: var(--sl-space-2) var(--sl-space-3);
      background: var(--sl-dark-2);
      border-radius: var(--sl-radius-panel);
    }
    .time {
      flex: none;
      min-width: 56px;
      font: 800 18px/24px var(--sl-font-display);
      color: var(--sl-highlight);
      text-transform: capitalize;
    }
    .time.missed {
      font-size: 14px;
      color: #ffd2c8;
    }
    .title {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--sl-space-2);
    }
  `,
})
export class TodayStrip {
  private readonly firebase = inject(FirebaseService);
  private readonly session = inject(Session);
  private readonly company = inject(CurrentCompany);
  private readonly visits = signal<PlannedVisit[]>([]);

  protected readonly rows = computed(() => {
    const projects = new Map(this.company.activeProjects().map((p) => [p.id, p]));
    const todayStart = stockholmDayRange(stockholmDate(new Date())).start.getTime();
    return this.visits()
      .filter((v) => projects.has(v.projectId) && !v.reportPostId)
      .map((v) => ({
        ...v,
        title: projects.get(v.projectId)!.title,
        service: projects.get(v.projectId)!.kind === 'service',
        missed: v.startAt.toMillis() < todayStart,
      }));
  });

  constructor() {
    effect((onCleanup) => {
      const companyId = this.session.claims().cid;
      const isCrew = this.session.role() === 'crew';
      const projectIds = this.company.activeProjects().map((p) => p.id);
      if (!companyId) return;
      let unsubscribe: (() => void) | undefined;
      let cancelled = false;
      const end = stockholmDayRange(stockholmDate(new Date())).end;
      void Promise.all([this.firebase.firestore(), import('firebase/firestore')]).then(
        ([db, fs]) => {
          if (cancelled) return;
          unsubscribe = watchPlannedVisits(db, fs, { companyId, isCrew, projectIds }, end, (v) =>
            this.visits.set(v),
          );
        },
      );
      onCleanup(() => {
        cancelled = true;
        unsubscribe?.();
      });
    });
  }
}

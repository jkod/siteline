import { Component, computed, inject } from '@angular/core';

import { TranslatePipe } from '@ngx-translate/core';
import { stockholmDate, stockholmDayRange, type Visit, type VisitRequest } from '@siteline/shared';

import { Language } from '../core/language';
import { liveDoc, liveQuery, type WithId } from '../core/live';
import { ProjectContext } from '../core/project-context';
import { Session } from '../core/session';
import { DatePipe, formatDate } from '../shared/pipes/date';
import { Button } from '../shared/ui/button';
import { Card } from '../shared/ui/card';
import { Dialogs } from '../shared/ui/dialog';
import { EmptyState } from '../shared/ui/empty-state';
import { Checklist } from '../shared/visits/checklist';
import {
  VisitRequestDialog,
  type VisitRequestDialogData,
} from '../shared/visits/visit-request-dialog';
import { VisitSummary } from '../shared/visits/visit-summary';

/**
 * The client's next visit with their checklist (PRD F3, F7). Service clients also see upcoming
 * visits and can ask to move or cancel one (F19).
 */
@Component({
  selector: 'sl-client-visits',
  imports: [TranslatePipe, DatePipe, Button, Card, EmptyState, Checklist, VisitSummary],
  template: `
    @if (context.project(); as p) {
      <section class="sl-stack" aria-labelledby="next-title">
        <h2 id="next-title">{{ 'pages.visit' | translate }}</h2>
        @if (next(); as v) {
          <article slCard class="sl-stack">
            <sl-visit-summary [visit]="v" />
            @if (pending(v.id)) {
              <p class="sl-small">{{ 'visits.requestPending' | translate }}</p>
            } @else if (p.kind === 'service') {
              <div>
                <button slButton="secondary" type="button" (click)="request(v)">
                  {{ 'visits.askToChange' | translate }}
                </button>
              </div>
            }
          </article>
        } @else if (next() === null) {
          <sl-empty-state
            [title]="'placeholders.clientVisitTitle' | translate"
            [body]="'placeholders.clientVisitBody' | translate"
          />
        }
      </section>

      <section slCard class="sl-stack" aria-labelledby="list-title">
        <h2 id="list-title">{{ 'checklist.yourList' | translate }}</h2>
        <sl-checklist [projectId]="p.id" [visitId]="p.nextVisitId" mode="client" />
      </section>

      @if (p.kind === 'service' && upcoming().length > 1) {
        <section class="sl-stack" aria-labelledby="upcoming-title">
          <h2 id="upcoming-title">{{ 'visits.upcoming' | translate }}</h2>
          <ul>
            @for (v of upcoming().slice(1); track v.id) {
              <li>
                <span class="when">{{ v.startAt | slDate: 'visit' }}</span>
                @if (pending(v.id)) {
                  <span class="sl-small">{{ 'visits.requestPending' | translate }}</span>
                } @else {
                  <button slButton="ghost" type="button" (click)="request(v)">
                    {{ 'visits.askToChange' | translate }}
                  </button>
                }
              </li>
            }
          </ul>
        </section>
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--sl-space-6);
    }
    ul {
      display: flex;
      flex-direction: column;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--sl-space-2);
      padding: var(--sl-space-1) 0;
      border-bottom: 1px solid var(--sl-border);
    }
    .when {
      flex: 1;
      font-weight: 600;
      text-transform: capitalize;
    }
  `,
})
export class ClientVisits {
  protected readonly context = inject(ProjectContext);
  private readonly session = inject(Session);
  private readonly dialogs = inject(Dialogs);
  private readonly language = inject(Language);
  private readonly projectId = computed(() => this.context.projectId());

  protected readonly next = liveDoc<Visit>(() => {
    const p = this.context.project();
    return p?.nextVisitId ? `projects/${p.id}/visits/${p.nextVisitId}` : null;
  });
  private readonly visits = liveQuery<Visit>(
    (db, fs) => {
      const id = this.projectId();
      if (!id) return null;
      const today = stockholmDayRange(stockholmDate(new Date())).start;
      return fs.query(
        fs.collection(db, 'projects', id, 'visits'),
        fs.where('status', '==', 'planned'),
        fs.where('startAt', '>=', fs.Timestamp.fromDate(today)),
        fs.orderBy('startAt'),
        fs.limit(12),
      );
    },
    () => this.projectId(),
  );
  protected readonly upcoming = computed(() => this.visits() ?? []);
  private readonly requests = liveQuery<VisitRequest>(
    (db, fs) => {
      const id = this.projectId();
      return id
        ? fs.query(
            fs.collection(db, 'projects', id, 'visitRequests'),
            fs.where('status', '==', 'open'),
          )
        : null;
    },
    () => this.projectId(),
  );

  protected pending(visitId: string): boolean {
    const uid = this.session.user()?.uid;
    return (this.requests() ?? []).some((r) => r.visitId === visitId && r.createdBy === uid);
  }

  protected request(visit: WithId<Visit>): void {
    this.dialogs.open<void, VisitRequestDialogData, VisitRequestDialog>(VisitRequestDialog, {
      projectId: this.projectId()!,
      visitId: visit.id,
      when: formatDate(visit.startAt, 'visit', this.language.lang()),
      mode: 'client',
    });
  }
}

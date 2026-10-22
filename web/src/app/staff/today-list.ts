import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TranslatePipe } from '@ngx-translate/core';
import { stockholmDate, stockholmDayRange } from '@siteline/shared';

import { FirebaseService } from '../core/firebase';
import { Language } from '../core/language';
import { Session } from '../core/session';
import { formatDate } from '../shared/pipes/date';
import { PluralPipe } from '../shared/pipes/plural';
import { Icon } from '../shared/ui/icon';
import type { IconName } from '../shared/ui/icons.generated';
import { CurrentCompany } from './current-company';
import { type PlannedVisit, watchPlannedVisits } from './planned-visits';

const DAY_MS = 86_400_000;
/** A decision without an answer this long, or a project without a post, needs a nudge. */
const DECISION_WAIT_MS = DAY_MS;
const QUIET_MS = 3 * DAY_MS;

interface TodayItem {
  key: string;
  icon: IconName;
  /** A translation key and its parameters. */
  text: string;
  params: Record<string, string | number>;
  project: string;
  link: string[];
}

/**
 * The staff Today list (PRD F14): decisions waiting over a day, unanswered questions, tomorrow's
 * visits with open checklist items, and projects with no post for three days. Booking requests
 * join with aftercare in M4.
 */
@Component({
  selector: 'sl-today-list',
  imports: [Icon, TranslatePipe, RouterLink, PluralPipe],
  template: `
    @if (items().length) {
      <section class="today" aria-labelledby="todo-title">
        <h2 id="todo-title">{{ 'todo.title' | translate }}</h2>
        <ul>
          @for (item of items(); track item.key) {
            <li>
              <a [routerLink]="item.link">
                <sl-icon [name]="item.icon" [size]="20" />
                <span class="text">
                  <span class="project">{{ item.project }}</span>
                  <span class="what">
                    {{ item.text | plural: +(item.params['count'] ?? 1) | translate: item.params }}
                  </span>
                </span>
              </a>
            </li>
          }
        </ul>
      </section>
    }
  `,
  styles: `
    .today {
      display: flex;
      flex-direction: column;
      gap: var(--sl-space-3);
      padding: var(--sl-space-4) var(--sl-space-5);
      background: var(--sl-surface);
      border: 1px solid var(--sl-border);
      border-radius: var(--sl-radius-card);
      box-shadow: var(--sl-shadow-card);
    }
    h2 {
      font: var(--sl-text-section);
    }
    ul {
      display: flex;
      flex-direction: column;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li + li {
      border-top: 1px solid var(--sl-border);
    }
    a {
      display: flex;
      align-items: center;
      gap: var(--sl-space-3);
      min-height: var(--sl-target);
      padding: var(--sl-space-2) 0;
      color: var(--sl-text);
      text-decoration: none;
    }
    a:hover .project {
      text-decoration: underline;
    }
    sl-icon {
      flex: none;
      color: var(--sl-accent-text);
    }
    .text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .project {
      font-weight: 600;
    }
    .what {
      font: var(--sl-text-small);
      color: var(--sl-text-2);
    }
  `,
})
export class TodayList {
  private readonly firebase = inject(FirebaseService);
  private readonly session = inject(Session);
  private readonly company = inject(CurrentCompany);
  private readonly language = inject(Language);

  /** Tomorrow's visits that still have open checklist items, with their counts. */
  private readonly tomorrow = signal<{ visit: PlannedVisit; open: number }[]>([]);

  protected readonly items = computed<TodayItem[]>(() => {
    const now = Date.now();
    const items: TodayItem[] = [];
    const projects = this.company.activeProjects();
    const byId = new Map(projects.map((p) => [p.id, p]));
    for (const p of projects) {
      const waiting = p.totals.oldestOpenDecisionAt?.toMillis();
      if (p.totals.openDecisions > 0 && waiting && now - waiting >= DECISION_WAIT_MS) {
        items.push({
          key: `decision-${p.id}`,
          icon: 'hourglass_empty',
          text: 'todo.decisionsWaiting',
          params: { count: p.totals.openDecisions },
          project: p.title,
          link: ['/app/projects', p.id, 'decisions'],
        });
      }
      if (p.totals.unansweredQuestions > 0) {
        items.push({
          key: `question-${p.id}`,
          icon: 'help',
          text: 'todo.questions',
          params: { count: p.totals.unansweredQuestions },
          project: p.title,
          link: ['/app/projects', p.id],
        });
      }
    }
    for (const { visit, open } of this.tomorrow()) {
      const p = byId.get(visit.projectId);
      if (!p) continue;
      items.push({
        key: `visit-${visit.id}`,
        icon: 'event',
        text: 'todo.visitTomorrow',
        params: { count: open, time: formatDate(visit.startAt, 'time', this.language.lang()) },
        project: p.title,
        link: ['/app/projects', p.id, 'visit'],
      });
    }
    for (const p of projects) {
      const last = (p.lastPostAt ?? p.createdAt)?.toMillis();
      if (p.kind === 'project' && last && now - last >= QUIET_MS) {
        items.push({
          key: `quiet-${p.id}`,
          icon: 'history',
          text: 'todo.quiet',
          params: { count: Math.floor((now - last) / DAY_MS) },
          project: p.title,
          link: ['/app/projects', p.id],
        });
      }
    }
    return items;
  });

  constructor() {
    effect((onCleanup) => {
      const companyId = this.session.claims().cid;
      const isCrew = this.session.role() === 'crew';
      const projectIds = this.company.activeProjects().map((p) => p.id);
      if (!companyId) return;
      let unsubscribe: (() => void) | undefined;
      let cancelled = false;
      const today = stockholmDate(new Date());
      const tomorrow = stockholmDate(stockholmDayRange(today).end);
      const { start, end } = stockholmDayRange(tomorrow);
      void Promise.all([this.firebase.firestore(), import('firebase/firestore')]).then(
        ([db, fs]) => {
          if (cancelled) return;
          unsubscribe = watchPlannedVisits(
            db,
            fs,
            { companyId, isCrew, projectIds },
            end,
            async (visits) => {
              const due = visits.filter((v) => v.startAt.toMillis() >= start.getTime());
              const counted = await Promise.all(
                due.map(async (visit) => {
                  const open = await fs
                    .getCountFromServer(
                      fs.query(
                        fs.collection(db, 'projects', visit.projectId, 'checklist'),
                        fs.where('visitId', '==', visit.id),
                        fs.where('doneAt', '==', null),
                      ),
                    )
                    .then((c) => c.data().count)
                    .catch(() => 0);
                  return { visit, open };
                }),
              );
              if (!cancelled) this.tomorrow.set(counted.filter((c) => c.open > 0));
            },
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

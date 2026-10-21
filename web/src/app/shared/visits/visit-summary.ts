import { Component, input } from '@angular/core';

import { TranslatePipe } from '@ngx-translate/core';
import type { Visit } from '@siteline/shared';

import { DatePipe } from '../pipes/date';
import { Icon } from '../ui/icon';

/** The visit's day and time, people and notes, as on the landing page's next-visit card. */
@Component({
  selector: 'sl-visit-summary',
  imports: [Icon, TranslatePipe, DatePipe],
  template: `
    @let v = visit();
    <p class="when">
      <sl-icon name="calendar_today" [size]="20" />
      <span>
        {{ v.startAt | slDate: 'visit' }}
        @if (v.endAt) {
          – {{ v.endAt | slDate: 'time' }}
        }
      </span>
      @if (v.status !== 'planned') {
        <span class="sl-badge sl-badge--neutral">{{
          'visits.status.' + v.status | translate
        }}</span>
      }
    </p>
    @if (v.people) {
      <p class="sl-small people">
        <sl-icon name="group" [size]="16" />
        {{ 'visits.peopleCount' | translate: { count: v.people } }}
      </p>
    }
    @if (v.notes) {
      <p class="notes">{{ v.notes }}</p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--sl-space-1);
    }
    .when {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--sl-space-2);
      font: 700 20px/26px var(--sl-font-display);
      text-transform: capitalize;
    }
    .people {
      display: flex;
      align-items: center;
      gap: var(--sl-space-1);
    }
    .notes {
      white-space: pre-wrap;
      color: var(--sl-text-2);
    }
  `,
})
export class VisitSummary {
  readonly visit = input.required<Visit>();
}

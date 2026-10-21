import { Component, input } from '@angular/core';

import { TranslatePipe } from '@ngx-translate/core';

import { EmptyState } from '../../shared/ui/empty-state';

/** Decisions, visits and handover arrive in M2 and M4; until then, an empty state. */
@Component({
  selector: 'sl-project-tab-placeholder',
  imports: [TranslatePipe, EmptyState],
  template: `<sl-empty-state [title]="titleKey() | translate" [body]="bodyKey() | translate" />`,
})
export class ProjectTabPlaceholder {
  readonly titleKey = input.required<string>();
  readonly bodyKey = input.required<string>();
}

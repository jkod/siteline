import { Component, computed, inject, input } from '@angular/core';

import { ProjectContext } from '../../core/project-context';
import { Feed } from '../../shared/feed/feed';
import { CurrentCompany } from '../current-company';

/** The staff feed with the update composer and milestones (PRD 4.2). */
@Component({
  selector: 'sl-project-feed',
  imports: [Feed],
  template: `
    @if (context.projectId(); as id) {
      <sl-feed
        [projectId]="id"
        mode="staff"
        [firmName]="firmName()"
        [focusPostId]="post() ?? null"
        [canReportCondition]="company.features().conditionCheckIn"
      />
    }
  `,
})
export class ProjectFeed {
  protected readonly context = inject(ProjectContext);
  protected readonly company = inject(CurrentCompany);
  /** From a notification link (?post=). */
  readonly post = input<string>();
  protected readonly firmName = computed(
    () => this.context.project()?.branding.name ?? this.company.name(),
  );
}

import { Component, inject } from '@angular/core';

import { ProjectContext } from '../../core/project-context';
import { DecisionsList } from '../../shared/decisions/decisions-list';

@Component({
  selector: 'sl-project-decisions',
  imports: [DecisionsList],
  template: `
    @if (context.projectId(); as id) {
      <sl-decisions-list [projectId]="id" mode="staff" />
    }
  `,
})
export class ProjectDecisions {
  protected readonly context = inject(ProjectContext);
}

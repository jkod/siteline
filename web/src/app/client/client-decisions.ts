import { Component, inject } from '@angular/core';

import { ProjectContext } from '../core/project-context';
import { DecisionsList } from '../shared/decisions/decisions-list';

@Component({
  selector: 'sl-client-decisions',
  imports: [DecisionsList],
  template: `
    @if (context.projectId(); as id) {
      <sl-decisions-list [projectId]="id" mode="client" />
    }
  `,
})
export class ClientDecisions {
  protected readonly context = inject(ProjectContext);
}

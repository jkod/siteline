import { Component, computed, inject, input } from '@angular/core';

import { ProjectContext } from '../core/project-context';
import { Feed } from '../shared/feed/feed';

/** The client's feed, with the "Ask a question" composer (PRD F3). */
@Component({
  selector: 'sl-client-feed',
  imports: [Feed],
  template: `
    @if (context.projectId(); as id) {
      <sl-feed
        [projectId]="id"
        mode="client"
        [firmName]="firmName()"
        [focusPostId]="post() ?? null"
      />
    }
  `,
})
export class ClientFeed {
  protected readonly context = inject(ProjectContext);
  readonly post = input<string>();
  protected readonly firmName = computed(() => this.context.project()?.branding.name ?? '');
}

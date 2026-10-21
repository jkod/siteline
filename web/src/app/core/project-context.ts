import { computed, Injectable, signal } from '@angular/core';

import type { Project, ProjectMember } from '@siteline/shared';

import { liveDoc, liveQuery } from './live';

/** The open project and its members, shared by the project's tabs. Provided by the shell. */
@Injectable()
export class ProjectContext {
  readonly projectId = signal<string | null>(null);

  readonly project = liveDoc<Project>(() =>
    this.projectId() ? `projects/${this.projectId()}` : null,
  );

  readonly members = liveQuery<ProjectMember>(
    (db, fs) => {
      const id = this.projectId();
      return id ? fs.query(fs.collection(db, 'projects', id, 'members'), fs.orderBy('name')) : null;
    },
    () => this.projectId(),
  );

  readonly clients = computed(() => (this.members() ?? []).filter((m) => m.role === 'client'));
  readonly crew = computed(() => (this.members() ?? []).filter((m) => m.role === 'crew'));
}

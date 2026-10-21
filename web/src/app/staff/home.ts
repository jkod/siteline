import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TranslatePipe } from '@ngx-translate/core';
import { canManageCompany, type ProjectKind, type ProjectStatus } from '@siteline/shared';

import { Session } from '../core/session';
import { DatePipe } from '../shared/pipes/date';
import { PluralPipe } from '../shared/pipes/plural';
import { Button } from '../shared/ui/button';
import { EmptyState } from '../shared/ui/empty-state';
import { Icon } from '../shared/ui/icon';
import { CurrentCompany } from './current-company';
import { TodayStrip } from './today-strip';

const STATUSES: ProjectStatus[] = ['active', 'completed', 'archived'];

/** Staff home: projects by status, with search (PRD section 11). */
@Component({
  selector: 'sl-staff-home',
  imports: [Icon, TranslatePipe, RouterLink, DatePipe, PluralPipe, Button, EmptyState, TodayStrip],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class StaffHome {
  private readonly session = inject(Session);
  protected readonly company = inject(CurrentCompany);

  protected readonly statuses = STATUSES;
  /** Projects, or service clients (PRD F19). */
  protected readonly view = signal<ProjectKind>('project');
  protected readonly emptyPrefix = computed(() =>
    this.view() === 'service' ? 'staffHome.emptyClients.' : 'staffHome.empty.',
  );
  protected readonly status = signal<ProjectStatus>('active');
  protected readonly search = signal('');
  protected readonly canManage = computed(() => canManageCompany(this.session.role()));
  protected readonly loading = computed(() => this.company.projects() === undefined);

  protected readonly visible = computed(() => {
    const term = this.search().trim().toLocaleLowerCase('sv');
    return (this.company.projects() ?? []).filter(
      (p) =>
        p.status === this.status() &&
        p.kind === this.view() &&
        (!term ||
          p.title.toLocaleLowerCase('sv').includes(term) ||
          (p.address?.street ?? '').toLocaleLowerCase('sv').includes(term)),
    );
  });

  protected readonly usage = computed(() => {
    const company = this.company.company();
    const key = this.view() === 'project' ? 'activeProjects' : 'serviceClients';
    const limit = this.company.limits()?.[key];
    return company && limit != null ? { used: company.usage[key], limit, key } : null;
  });
}

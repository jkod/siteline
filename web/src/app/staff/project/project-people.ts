import { afterNextRender, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';

import { LucideUserPlus } from '@lucide/angular';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import type { ProjectMember } from '@siteline/shared';
import { canManageCompany } from '@siteline/shared';

import { Api } from '../../core/api';
import { errorMessageKey } from '../../core/errors';
import type { WithId } from '../../core/live';
import { ProjectContext } from '../../core/project-context';
import { Session } from '../../core/session';
import { DatePipe } from '../../shared/pipes/date';
import { Avatar } from '../../shared/ui/avatar';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { Dialogs } from '../../shared/ui/dialog';
import { EmptyState } from '../../shared/ui/empty-state';
import { Toasts } from '../../shared/ui/toast';
import { CurrentCompany } from '../current-company';
import { CrewDialog, type CrewDialogData } from './crew-dialog';
import { InviteClientDialog } from './invite-client-dialog';

/** Clients and crew: invite, resend, revoke, remove and last opened (PRD F2). */
@Component({
  selector: 'sl-project-people',
  imports: [TranslatePipe, DatePipe, Avatar, Button, Card, EmptyState, LucideUserPlus],
  templateUrl: './project-people.html',
  styleUrl: './project-people.css',
})
export class ProjectPeople {
  protected readonly context = inject(ProjectContext);
  private readonly company = inject(CurrentCompany);
  private readonly session = inject(Session);
  private readonly api = inject(Api);
  private readonly dialogs = inject(Dialogs);
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);

  /** ?invite=1 opens the invite dialog, right after a project is created. */
  readonly invite = input<string>();
  protected readonly canManage = computed(() => canManageCompany(this.session.role()));

  constructor() {
    afterNextRender(() => {
      if (this.invite()) {
        void this.router.navigate([], { queryParams: {}, replaceUrl: true });
        this.openInvite();
      }
    });
  }

  protected openInvite(): void {
    const projectId = this.context.projectId();
    if (projectId) this.dialogs.open(InviteClientDialog, { projectId });
  }

  protected editCrew(): void {
    const projectId = this.context.projectId();
    if (!projectId) return;
    this.dialogs.open<void, CrewDialogData, CrewDialog>(CrewDialog, {
      projectId,
      options: (this.company.staff() ?? [])
        .filter((s) => s.role === 'crew')
        .map((s) => ({ id: s.id, name: s.name })),
      selected: this.context.project()?.crewUids ?? [],
    });
  }

  protected linkState(member: WithId<ProjectMember>): 'revoked' | 'joined' | 'invited' {
    if (member.invite?.revokedAt) return 'revoked';
    return member.joinedAt ? 'joined' : 'invited';
  }

  protected async resend(member: WithId<ProjectMember>): Promise<void> {
    await this.run(
      () => this.api.resendInvite(this.context.projectId()!, member.id),
      'people.resent',
      member.name,
    );
  }

  protected async revoke(member: WithId<ProjectMember>): Promise<void> {
    if (!(await this.confirm('revoke', member.name))) return;
    await this.run(
      () => this.api.revokeInvite(this.context.projectId()!, member.id),
      'people.revoked',
      member.name,
    );
  }

  protected async remove(member: WithId<ProjectMember>): Promise<void> {
    if (!(await this.confirm('remove', member.name))) return;
    await this.run(
      () => this.api.removeClient(this.context.projectId()!, member.id),
      'people.removed',
      member.name,
    );
  }

  private confirm(action: 'revoke' | 'remove', name: string): Promise<boolean> {
    const t = (key: string) => this.translate.instant(key, { name }) as string;
    return this.dialogs.confirm({
      title: t(`people.${action}Title`),
      message: t(`people.${action}Body`),
      confirmLabel: t(`people.${action}Confirm`),
      cancelLabel: t('common.cancel'),
      danger: true,
    });
  }

  private async run(action: () => Promise<unknown>, doneKey: string, name: string): Promise<void> {
    try {
      await action();
      this.toasts.show(this.translate.instant(doneKey, { name }), 'success');
    } catch (error) {
      const key = errorMessageKey(error);
      if (key) this.toasts.show(this.translate.instant(key), 'error');
    }
  }
}

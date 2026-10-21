import { Component, computed, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { canManageCompany, type ProjectStatus, type Visit } from '@siteline/shared';

import { Api } from '../../core/api';
import { errorMessageKey, errorReason } from '../../core/errors';
import { liveDoc } from '../../core/live';
import { ProjectContext } from '../../core/project-context';
import { Session } from '../../core/session';
import { DatePipe } from '../../shared/pipes/date';
import { PluralPipe } from '../../shared/pipes/plural';
import { Button } from '../../shared/ui/button';
import { Dialogs } from '../../shared/ui/dialog';
import { HideOnScroll } from '../../shared/ui/hide-on-scroll';
import { Toasts } from '../../shared/ui/toast';
import { usePlanLimitDialog } from '../plan-limit';

/**
 * A project for staff: header with the clients and open questions, and tabs for the feed,
 * decisions, visits, people and handover (PRD section 11). Tabs sit at the bottom on phones; on
 * wide screens they float at the top with the project name and slide away while scrolling.
 */
@Component({
  selector: 'sl-project-shell',
  imports: [
    TranslatePipe,
    PluralPipe,
    DatePipe,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    Button,
    HideOnScroll,
  ],
  providers: [ProjectContext],
  templateUrl: './project-shell.html',
  styleUrl: './project-shell.css',
})
export class ProjectShell {
  protected readonly context = inject(ProjectContext);
  private readonly session = inject(Session);
  private readonly api = inject(Api);
  private readonly dialogs = inject(Dialogs);
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);
  private readonly planLimit = usePlanLimitDialog();

  readonly projectId = input.required<string>();

  protected readonly canManage = computed(() => canManageCompany(this.session.role()));
  protected readonly clientNames = computed(() =>
    this.context
      .clients()
      .map((c) => c.name)
      .join(', '),
  );
  protected readonly changingStatus = signal(false);
  /** The sidebar layout, where the phone top bar is gone and the tabs become the floating bar. */
  protected readonly wide = signal(false);
  protected readonly nextVisit = liveDoc<Visit>(() => {
    const p = this.context.project();
    return p?.nextVisitId ? `projects/${p.id}/visits/${p.nextVisitId}` : null;
  });
  protected readonly tabs = computed(() => [
    { path: '.', label: 'pages.projectFeed', exact: true },
    { path: 'decisions', label: 'pages.decisions', exact: false },
    { path: 'visit', label: 'pages.visit', exact: false },
    { path: 'people', label: 'pages.people', exact: false },
    ...(this.canManage() ? [{ path: 'handover', label: 'pages.handover', exact: false }] : []),
  ]);

  constructor() {
    effect(() => this.context.projectId.set(this.projectId()));

    const media = window.matchMedia('(min-width: 1024px)');
    const onMedia = () => this.wide.set(media.matches);
    onMedia();
    media.addEventListener('change', onMedia);
    inject(DestroyRef).onDestroy(() => media.removeEventListener('change', onMedia));
  }

  protected async setStatus(status: ProjectStatus): Promise<void> {
    const t = (key: string) => this.translate.instant(key) as string;
    if (status !== 'active') {
      const ok = await this.dialogs.confirm({
        title: t(`projectStatus.${status}Title`),
        message: t(`projectStatus.${status}Body`),
        confirmLabel: t(`projectStatus.${status}Confirm`),
        cancelLabel: t('common.cancel'),
      });
      if (!ok) return;
    }
    this.changingStatus.set(true);
    try {
      await this.api.setProjectStatus(this.projectId(), status);
      this.toasts.show(t(`projectStatus.${status}Done`), 'success');
    } catch (error) {
      if (errorReason(error) === 'plan_limit') {
        await this.planLimit();
      } else {
        const key = errorMessageKey(error);
        if (key) this.toasts.show(this.translate.instant(key), 'error');
      }
    } finally {
      this.changingStatus.set(false);
    }
  }
}

import { Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import type { ApprovalRule, NotifyChannel, Project, ProjectMember } from '@siteline/shared';

import { Api } from '../core/api';
import { errorMessageKey } from '../core/errors';
import { liveDoc, liveQuery, useFirestore, type WithId } from '../core/live';
import { PushService } from '../core/push';
import { Session } from '../core/session';
import { Button } from '../shared/ui/button';
import { Card } from '../shared/ui/card';
import { Dialogs } from '../shared/ui/dialog';
import { FeedStylePicker } from '../shared/ui/feed-style-picker';
import { LanguageSwitch } from '../shared/ui/language-switch';
import { PushToggle } from '../shared/ui/push-toggle';
import { Toasts } from '../shared/ui/toast';
import { InviteCard } from './invite-card';

/** One project's notification choices, saved on the client's own member document. */
@Component({
  selector: 'sl-project-notify',
  imports: [TranslatePipe, Card, Button],
  template: `
    @let p = project();
    <section slCard class="sl-stack" [attr.aria-labelledby]="'p-' + p.id">
      <h2 [id]="'p-' + p.id">{{ p.title }}</h2>
      <p class="sl-small">{{ p.branding.name }}</p>
      <label class="check">
        <input
          type="checkbox"
          [checked]="notify().digest"
          (change)="set({ digest: $any($event.target).checked })"
        />
        {{ 'clientSettings.digest' | translate }}
      </label>
      <label class="check">
        <input
          type="checkbox"
          [checked]="notify().instant"
          (change)="set({ instant: $any($event.target).checked })"
        />
        {{ 'clientSettings.instant' | translate }}
      </label>
      <label class="field">
        <span>{{ 'clientSettings.channel' | translate }}</span>
        <select
          class="sl-input"
          [value]="notify().channel"
          (change)="set({ channel: $any($event.target).value })"
        >
          <option value="sms">{{ 'clientSettings.sms' | translate }}</option>
          <option value="email">{{ 'clientSettings.email' | translate }}</option>
          @if (push.state() === 'on' || notify().channel === 'push') {
            <option value="push">{{ 'clientSettings.push' | translate }}</option>
          }
        </select>
      </label>
      @if (p.clientUids.length > 1) {
        <fieldset class="rule">
          <legend>{{ 'approvalRule.label' | translate }}</legend>
          @for (rule of rules; track rule) {
            <label class="check">
              <input
                type="radio"
                [name]="'rule-' + p.id"
                [value]="rule"
                [checked]="(p.approvalRule ?? 'any') === rule"
                (change)="setRule(rule)"
              />
              {{ 'approvalRule.' + rule | translate }}
            </label>
          }
          <p class="sl-small">{{ 'approvalRule.help' | translate }}</p>
        </fieldset>
      }
      <div>
        <button slButton="ghost" type="button" (click)="leave()">
          {{ 'privacy.leave' | translate }}
        </button>
      </div>
    </section>
  `,
  styles: `
    .check {
      display: flex;
      align-items: center;
      gap: var(--sl-space-3);
      min-height: var(--sl-target);
    }
    .check input {
      width: 22px;
      height: 22px;
      accent-color: var(--sl-accent);
    }
    .rule {
      display: flex;
      flex-direction: column;
      margin: 0;
      padding: 0;
      border: 0;
    }
    .rule legend {
      padding: 0;
      font-weight: 600;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: var(--sl-space-2);
      font-weight: 600;
    }
  `,
})
export class ProjectNotify {
  private readonly session = inject(Session);
  private readonly firestore = useFirestore();
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);
  private readonly api = inject(Api);
  private readonly dialogs = inject(Dialogs);
  protected readonly push = inject(PushService);

  readonly project = input.required<WithId<Project>>();
  protected readonly rules: ApprovalRule[] = ['any', 'all'];
  private readonly member = liveDoc<ProjectMember>(() => {
    const uid = this.session.user()?.uid;
    return uid ? `projects/${this.project().id}/members/${uid}` : null;
  });
  protected readonly notify = computed(() => ({
    instant: false,
    digest: true,
    channel: 'sms' as NotifyChannel,
    ...this.member()?.notify,
  }));

  /** Leaving ends access and takes the client's name out of the project (PRD F11). */
  protected async leave(): Promise<void> {
    const t = (key: string, params?: object) => this.translate.instant(key, params) as string;
    const ok = await this.dialogs.confirm({
      title: t('privacy.leaveTitle', { project: this.project().title }),
      message: t('privacy.leaveBody'),
      confirmLabel: t('privacy.leave'),
      cancelLabel: t('common.cancel'),
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.leaveProject(this.project().id);
      this.toasts.show(t('privacy.left'), 'success');
    } catch (error) {
      const key = errorMessageKey(error);
      if (key) this.toasts.show(t(key), 'error');
    }
  }

  /** Who must approve priced decisions on this project (the user's request). */
  protected async setRule(rule: ApprovalRule): Promise<void> {
    try {
      await this.api.setApprovalRule(this.project().id, rule);
      this.toasts.show(this.translate.instant('approvalRule.saved'), 'success');
    } catch (error) {
      const key = errorMessageKey(error);
      if (key) this.toasts.show(this.translate.instant(key), 'error');
    }
  }

  protected async set(
    change: Partial<{ digest: boolean; instant: boolean; channel: NotifyChannel }>,
  ): Promise<void> {
    const uid = this.session.user()?.uid;
    if (!uid) return;
    try {
      await this.firestore((db, fs) =>
        fs.updateDoc(fs.doc(db, 'projects', this.project().id, 'members', uid), {
          notify: { ...this.notify(), ...change },
        }),
      );
      this.toasts.show(this.translate.instant('me.saved'), 'success');
    } catch (error) {
      const key = errorMessageKey(error);
      if (key) this.toasts.show(this.translate.instant(key), 'error');
    }
  }
}

/**
 * Notification choices per project (PRD section 6): the daily digest, instant updates, and text
 * or email. Decisions always notify. Leaving a project and deleting data arrive in M4.
 */
@Component({
  selector: 'sl-client-settings',
  imports: [
    TranslatePipe,
    RouterLink,
    ProjectNotify,
    Card,
    Button,
    FeedStylePicker,
    InviteCard,
    LanguageSwitch,
    PushToggle,
  ],
  template: `
    <main class="sl-page sl-stack" id="main">
      <h1>{{ 'pages.clientSettings' | translate }}</h1>
      <section slCard class="sl-stack" aria-labelledby="language-title">
        <h2 id="language-title">{{ 'companySettings.language' | translate }}</h2>
        <sl-language-switch />
      </section>
      <section slCard aria-labelledby="push-title">
        <sl-push-toggle />
      </section>
      <section slCard>
        <sl-feed-style-picker />
      </section>
      <p class="sl-small">{{ 'clientSettings.intro' | translate }}</p>
      @for (project of projects() ?? []; track project.id) {
        <sl-project-notify [project]="project" />
      }
      @if (projects()?.[0]; as first) {
        <sl-invite-card [projectId]="first.id" [companyId]="first.companyId" />
      }
      <section slCard class="sl-stack" aria-labelledby="remove-title">
        <h2 id="remove-title">{{ 'privacy.removeTitle' | translate }}</h2>
        <p>{{ 'privacy.removeBody' | translate }}</p>
        <div>
          <button slButton="danger" type="button" (click)="removeMyData()">
            {{ 'privacy.remove' | translate }}
          </button>
        </div>
      </section>
      <div>
        <button slButton="secondary" type="button" (click)="signOut()">
          {{ 'common.signOut' | translate }}
        </button>
      </div>
      <p class="sl-small legal">
        <a routerLink="/legal/privacy">{{ 'pages.privacy' | translate }}</a>
        <a routerLink="/legal/terms">{{ 'pages.terms' | translate }}</a>
      </p>
    </main>
  `,
  styles: `
    .legal {
      display: flex;
      flex-wrap: wrap;
      gap: var(--sl-space-4);
    }
    .legal a {
      display: inline-flex;
      align-items: center;
      min-height: var(--sl-target);
    }
  `,
})
export class ClientSettings {
  private readonly session = inject(Session);
  private readonly api = inject(Api);
  private readonly dialogs = inject(Dialogs);
  private readonly router = inject(Router);
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);

  protected async signOut(): Promise<void> {
    await this.session.signOut();
    await this.router.navigateByUrl('/login');
  }

  /** Removes the client's data and account everywhere (PRD F11). */
  protected async removeMyData(): Promise<void> {
    const t = (key: string) => this.translate.instant(key) as string;
    const ok = await this.dialogs.confirm({
      title: t('privacy.removeTitle'),
      message: t('privacy.removeConfirm'),
      confirmLabel: t('privacy.remove'),
      cancelLabel: t('common.cancel'),
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.deleteMyData();
      await this.session.signOut();
      await this.router.navigateByUrl('/login/client');
      this.toasts.show(t('privacy.removed'), 'success');
    } catch (error) {
      const key = errorMessageKey(error);
      if (key) this.toasts.show(t(key), 'error');
    }
  }
  protected readonly projects = liveQuery<Project>(
    (db, fs) => {
      const uid = this.session.user()?.uid;
      return uid
        ? fs.query(fs.collection(db, 'projects'), fs.where('clientUids', 'array-contains', uid))
        : null;
    },
    () => this.session.user()?.uid,
  );
}

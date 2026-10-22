import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import type { NotifyChannel, Project, ProjectMember } from '@siteline/shared';

import { errorMessageKey } from '../core/errors';
import { liveDoc, liveQuery, useFirestore, type WithId } from '../core/live';
import { Session } from '../core/session';
import { Card } from '../shared/ui/card';
import { FeedStylePicker } from '../shared/ui/feed-style-picker';
import { Toasts } from '../shared/ui/toast';
import { InviteCard } from './invite-card';

/** One project's notification choices, saved on the client's own member document. */
@Component({
  selector: 'sl-project-notify',
  imports: [TranslatePipe, Card],
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
        </select>
      </label>
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

  readonly project = input.required<WithId<Project>>();
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
  imports: [TranslatePipe, RouterLink, ProjectNotify, Card, FeedStylePicker, InviteCard],
  template: `
    <main class="sl-page sl-stack" id="main">
      <h1>{{ 'pages.clientSettings' | translate }}</h1>
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

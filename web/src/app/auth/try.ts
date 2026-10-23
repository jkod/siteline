import { NgOptimizedImage } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { Api } from '../core/api';
import { errorMessageKey } from '../core/errors';
import { Language } from '../core/language';
import { Session } from '../core/session';
import { Button } from '../shared/ui/button';
import { Toasts } from '../shared/ui/toast';

type Kind = 'firm' | 'client';

/**
 * "Prova Siteline": pick firm or client and get a private sandbox with made-up projects.
 * Nothing in it is sent to anyone, and it's deleted after a few days.
 */
@Component({
  selector: 'sl-try',
  imports: [NgOptimizedImage, TranslatePipe, RouterLink, Button],
  styleUrl: './auth-layout.css',
  styles: `
    .choices {
      display: flex;
      flex-direction: column;
      gap: var(--sl-space-3);
    }
    .choice {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--sl-space-1);
      width: 100%;
      min-height: auto;
      padding: var(--sl-space-4) var(--sl-space-5);
      text-align: left;
      white-space: normal;
    }
    .choice .what {
      font: 700 18px/24px var(--sl-font-display);
    }
    .choice .detail {
      font: var(--sl-text-small);
      font-weight: 400;
    }
  `,
  template: `
    <main class="layout" id="main">
      <p class="brand">
        <img ngSrc="icons/favicon.svg" alt="" width="32" height="32" priority />
        Siteline
      </p>
      <div class="sl-stack">
        <h1>{{ 'try.title' | translate }}</h1>
        <p class="intro">{{ 'try.intro' | translate }}</p>
      </div>
      <div class="choices">
        @for (kind of kinds; track kind) {
          <button
            slButton="secondary"
            type="button"
            class="choice"
            [busy]="starting() === kind"
            [disabled]="starting() !== null"
            (click)="start(kind)"
          >
            <span class="what">{{ 'try.' + kind + '.title' | translate }}</span>
            <span class="detail">{{ 'try.' + kind + '.detail' | translate }}</span>
          </button>
        }
      </div>
      <p class="sl-small">{{ 'try.note' | translate }}</p>
      <p class="sl-small">
        <a routerLink="/login">{{ 'try.haveAccount' | translate }}</a>
      </p>
    </main>
  `,
})
export class Try {
  private readonly api = inject(Api);
  private readonly session = inject(Session);
  private readonly language = inject(Language);
  private readonly router = inject(Router);
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);

  protected readonly kinds: Kind[] = ['firm', 'client'];
  protected readonly starting = signal<Kind | null>(null);

  protected async start(kind: Kind): Promise<void> {
    this.starting.set(kind);
    try {
      if (this.session.signedIn()) await this.session.signOut();
      const { token } = await this.api.startDemo(kind, this.language.lang());
      await this.session.signInWithClientToken(token);
      await this.router.navigateByUrl(kind === 'firm' ? '/app' : '/c', { replaceUrl: true });
    } catch (error) {
      this.toasts.show(this.translate.instant(errorMessageKey(error) ?? 'errors.unknown'), 'error');
      this.starting.set(null);
    }
  }
}

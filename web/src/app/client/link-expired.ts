import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { Api } from '../core/api';
import { errorMessageKey } from '../core/errors';
import { Button } from '../shared/ui/button';
import { Card } from '../shared/ui/card';
import { Toasts } from '../shared/ui/toast';

/**
 * An expired or revoked link, or no session: explains what happened and lets the client ask
 * the firm for a new link (PRD 4.1, F3). The token travels in navigation state, never the URL.
 */
@Component({
  selector: 'sl-link-expired',
  imports: [TranslatePipe, RouterLink, Button, Card],
  template: `
    <main class="sl-page sl-stack" id="main">
      <section slCard class="sl-stack" aria-labelledby="expired-title">
        <h1 id="expired-title">{{ 'pages.linkExpired' | translate }}</h1>
        <p>{{ (token ? 'linkExpired.body' : 'linkExpired.noLink') | translate }}</p>
        @if (token) {
          @if (requested()) {
            <p role="status" class="done">{{ 'linkExpired.requested' | translate }}</p>
          } @else {
            <div>
              <button
                slButton
                size="large"
                type="button"
                [busy]="busy()"
                [disabled]="busy()"
                (click)="request()"
              >
                {{ 'linkExpired.request' | translate }}
              </button>
            </div>
          }
        }
        <p>
          <a routerLink="/login/client">{{ 'linkExpired.signIn' | translate }}</a>
        </p>
      </section>
    </main>
  `,
  styles: `
    .done {
      font-weight: 600;
      color: var(--sl-accent-text);
    }
  `,
})
export class LinkExpired {
  private readonly api = inject(Api);
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);

  protected readonly token = (history.state as { token?: string } | null)?.token ?? null;
  protected readonly busy = signal(false);
  protected readonly requested = signal(false);

  protected async request(): Promise<void> {
    if (!this.token) return;
    this.busy.set(true);
    try {
      await this.api.requestNewLink(this.token);
      this.requested.set(true);
    } catch (error) {
      const key = errorMessageKey(error);
      if (key) this.toasts.show(this.translate.instant(key), 'error');
    } finally {
      this.busy.set(false);
    }
  }
}

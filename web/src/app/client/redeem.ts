import { Component, inject, input, type OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { Api } from '../core/api';
import { errorMessageKey, errorReason } from '../core/errors';
import { Session } from '../core/session';
import { Button } from '../shared/ui/button';
import { Card } from '../shared/ui/card';

const LINK_PROBLEMS = new Set(['link_expired', 'link_revoked', 'link_used', 'invalid_link']);

/**
 * Opens a link from a text message (PRD 4.1). Client links sign the person in with no password
 * and open their project; staff links ask them to sign in, then add them to the company.
 */
@Component({
  selector: 'sl-redeem',
  imports: [TranslatePipe, RouterLink, Button, Card],
  template: `
    <main class="sl-page sl-stack" id="main">
      @switch (state()) {
        @case ('working') {
          <h1>{{ 'pages.redeem' | translate }}</h1>
          <p role="status">{{ 'redeem.working' | translate }}</p>
        }
        @case ('staff') {
          <section slCard class="sl-stack" aria-labelledby="join-title">
            <h1 id="join-title">
              {{ 'redeem.joinTitle' | translate: { company: companyName() } }}
            </h1>
            <p>{{ 'redeem.joinBody' | translate }}</p>
            <a
              slButton
              size="large"
              routerLink="/login"
              [queryParams]="{ returnUrl: '/p/' + token() }"
            >
              {{ 'redeem.signInToJoin' | translate }}
            </a>
          </section>
        }
        @case ('error') {
          <section slCard class="sl-stack" aria-labelledby="error-title">
            <h1 id="error-title">{{ 'redeem.errorTitle' | translate }}</h1>
            <p role="alert">{{ errorKey() | translate }}</p>
            <a slButton="secondary" routerLink="/">{{ 'redeem.home' | translate }}</a>
          </section>
        }
      }
    </main>
  `,
})
export class Redeem implements OnInit {
  private readonly api = inject(Api);
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  readonly token = input.required<string>();
  protected readonly state = signal<'working' | 'staff' | 'error'>('working');
  protected readonly companyName = signal('');
  protected readonly errorKey = signal('errors.unknown');

  async ngOnInit(): Promise<void> {
    await this.session.ready;
    try {
      const result = await this.api.redeemInvite(this.token());
      if (result.kind === 'client') {
        await this.session.signInWithClientToken(result.token);
        await this.router.navigate(['/c', result.projectId], { replaceUrl: true });
        return;
      }
      this.companyName.set(result.companyName);
      if (this.session.isStaff()) {
        this.fail('errors.reasons.already_in_company');
      } else if (this.session.signedIn() && !this.session.isClient()) {
        await this.api.acceptStaffInvite(this.token());
        await this.session.refreshClaims();
        await this.router.navigateByUrl('/app', { replaceUrl: true });
      } else {
        this.state.set('staff');
      }
    } catch (error) {
      const reason = errorReason(error);
      if (reason && LINK_PROBLEMS.has(reason)) {
        await this.router.navigate(['/link-expired'], {
          replaceUrl: true,
          state: { token: this.token() },
        });
        return;
      }
      this.fail(errorMessageKey(error) ?? 'errors.unknown');
    }
  }

  private fail(key: string): void {
    this.errorKey.set(key);
    this.state.set('error');
  }
}

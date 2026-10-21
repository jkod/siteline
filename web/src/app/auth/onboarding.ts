import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';

import { TranslatePipe } from '@ngx-translate/core';

import { Session } from '../core/session';
import { Button } from '../shared/ui/button';
import { Card } from '../shared/ui/card';

/** Company setup for a new staff member. The flow itself is built in M1 (PRD F1). */
@Component({
  selector: 'sl-onboarding',
  imports: [TranslatePipe, Button, Card],
  template: `
    <main class="sl-page sl-stack" id="main">
      <h1>{{ 'pages.onboarding' | translate }}</h1>
      <section slCard="panel" class="sl-stack">
        <p>{{ 'onboarding.comingSoon' | translate }}</p>
        <p class="sl-small">{{ 'onboarding.signedInAs' | translate: { email: email() } }}</p>
      </section>
      <div>
        <button slButton="secondary" type="button" (click)="signOut()">
          {{ 'common.signOut' | translate }}
        </button>
      </div>
    </main>
  `,
})
export class Onboarding {
  private readonly session = inject(Session);
  private readonly router = inject(Router);

  protected readonly email = computed(() => this.session.user()?.email ?? '');

  protected async signOut(): Promise<void> {
    await this.session.signOut();
    await this.router.navigateByUrl('/login');
  }
}

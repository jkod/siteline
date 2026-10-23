import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

import { TranslatePipe } from '@ngx-translate/core';

import { Session } from '../../core/session';
import { Button } from './button';

/** Tells a "try Siteline" visitor that the projects are made up, with a way out. */
@Component({
  selector: 'sl-demo-banner',
  imports: [TranslatePipe, Button],
  template: `
    @if (session.isDemo()) {
      <aside class="demo" [attr.aria-label]="'demo.label' | translate">
        <p>{{ 'demo.body' | translate }}</p>
        <button slButton="ghost" type="button" (click)="end()">{{ 'demo.end' | translate }}</button>
      </aside>
    }
  `,
  styles: `
    .demo {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 0 var(--sl-space-3);
      padding: var(--sl-space-1) var(--sl-space-4);
      background: var(--sl-dark);
      color: #fff;
      font: var(--sl-text-small);
      text-align: center;
    }
    .demo button {
      color: #fff;
    }
  `,
})
export class DemoBanner {
  protected readonly session = inject(Session);
  private readonly router = inject(Router);

  protected async end(): Promise<void> {
    await this.session.signOut();
    await this.router.navigateByUrl('/try');
  }
}

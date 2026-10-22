import { NgOptimizedImage } from '@angular/common';
import { Component, inject, input, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';

import { TranslatePipe } from '@ngx-translate/core';
import type { BusinessKind } from '@siteline/shared';

import { Api } from '../core/api';
import { rememberReferralCode } from '../core/referral-code';
import { Button } from '../shared/ui/button';

/**
 * The page behind a client's invite link, /r/{code} (PRD 4.5): what Siteline does for the kind
 * of business invited, and a way to start. It names the client by first name only if they chose
 * to, and the code is kept so the sign-up is attributed (F20).
 */
@Component({
  selector: 'sl-referral',
  imports: [NgOptimizedImage, TranslatePipe, Button],
  styleUrl: './auth-layout.css',
  styles: `
    .points {
      display: flex;
      flex-direction: column;
      gap: var(--sl-space-2);
      margin: 0;
      padding-left: var(--sl-space-5);
    }
  `,
  template: `
    <main class="layout" id="main">
      <p class="brand">
        <img ngSrc="icons/favicon.svg" alt="" width="32" height="32" priority />
        Siteline
      </p>
      @if (loaded()) {
        <h1>
          @if (invite()?.firstName; as name) {
            {{ 'referral.titleNamed' | translate: { name } }}
          } @else {
            {{ 'referral.title' | translate }}
          }
        </h1>
        <p class="intro">{{ 'referral.intro.' + kind() | translate }}</p>
        <ul class="points">
          <li>{{ 'referral.point1' | translate }}</li>
          <li>{{ 'referral.point2' | translate }}</li>
          <li>{{ 'referral.point3' | translate }}</li>
        </ul>
        <div>
          <button slButton size="large" type="button" (click)="start()">
            {{ 'referral.start' | translate }}
          </button>
        </div>
        <p class="sl-small">{{ 'referral.free' | translate }}</p>
      }
    </main>
  `,
})
export class Referral implements OnInit {
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  readonly code = input.required<string>();
  protected readonly invite = signal<{
    firstName: string | null;
    businessKind: BusinessKind;
  } | null>(null);
  protected readonly loaded = signal(false);
  protected readonly kind = () => this.invite()?.businessKind ?? 'other';

  async ngOnInit(): Promise<void> {
    try {
      this.invite.set(await this.api.openReferral(this.code()));
      rememberReferralCode(this.code());
    } catch {
      // An unknown or mistyped code still gets the general page, without attribution.
    } finally {
      this.loaded.set(true);
    }
  }

  protected start(): void {
    void this.router.navigateByUrl('/login');
  }
}

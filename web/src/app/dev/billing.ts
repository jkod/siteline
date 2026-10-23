import { Component, inject, input, type OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { type BillingInterval, PAID_PLANS, type PaidPlan } from '@siteline/shared';

import { Api } from '../core/api';
import { errorMessageKey } from '../core/errors';
import { Button } from '../shared/ui/button';
import { Card } from '../shared/ui/card';
import { Toasts } from '../shared/ui/toast';

/**
 * Stands in for Stripe in the emulator: a pretend checkout, and buttons that play the events
 * Stripe would send (paid, plan changed, payment failed, cancelled) through the real webhook
 * handler. Signed in as the company's owner.
 */
@Component({
  selector: 'sl-dev-billing',
  imports: [TranslatePipe, Button, Card],
  template: `
    <main class="sl-page sl-stack" id="main">
      <h1>{{ 'pages.devBilling' | translate }}</h1>
      <p class="sl-small">{{ 'dev.billingIntro' | translate }}</p>
      @if (checkout()) {
        <section slCard class="sl-stack" aria-labelledby="checkout-title">
          <h2 id="checkout-title">
            {{
              'dev.checkoutTitle'
                | translate
                  : {
                      plan: ('plans.' + selectedPlan() | translate),
                      interval: ('billing.' + selectedInterval() | translate),
                    }
            }}
          </h2>
          <div class="row">
            <button slButton type="button" [busy]="busy()" (click)="play('pay')">
              {{ 'dev.pay' | translate }}
            </button>
            <button slButton="secondary" type="button" (click)="back(false)">
              {{ 'common.cancel' | translate }}
            </button>
          </div>
        </section>
      }
      <section slCard class="sl-stack" aria-labelledby="events-title">
        <h2 id="events-title">{{ 'dev.eventsTitle' | translate }}</h2>
        <label class="field">
          <span>{{ 'dev.plan' | translate }}</span>
          <select
            class="sl-input"
            [value]="selectedPlan()"
            (change)="selectedPlan.set($any($event.target).value)"
          >
            @for (p of plans; track p) {
              <option [value]="p">{{ 'plans.' + p | translate }}</option>
            }
          </select>
        </label>
        <div class="row">
          <button slButton="secondary" type="button" [disabled]="busy()" (click)="play('change')">
            {{ 'dev.change' | translate }}
          </button>
          <button slButton="secondary" type="button" [disabled]="busy()" (click)="play('fail')">
            {{ 'dev.fail' | translate }}
          </button>
          <button slButton="secondary" type="button" [disabled]="busy()" (click)="play('cancel')">
            {{ 'dev.cancelSubscription' | translate }}
          </button>
        </div>
      </section>
    </main>
  `,
  styles: `
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--sl-space-3);
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: var(--sl-space-2);
      font-weight: 600;
    }
  `,
})
export class DevBilling implements OnInit {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);

  /** From the pretend checkout URL. */
  readonly checkout = input<string>();
  readonly plan = input<PaidPlan>();
  readonly interval = input<BillingInterval>();

  protected readonly plans = PAID_PLANS;
  protected readonly selectedPlan = signal<PaidPlan>('solo');
  protected readonly selectedInterval = signal<BillingInterval>('month');
  protected readonly busy = signal(false);

  ngOnInit(): void {
    if (this.plan()) this.selectedPlan.set(this.plan()!);
    if (this.interval()) this.selectedInterval.set(this.interval()!);
  }

  protected async play(action: 'pay' | 'change' | 'fail' | 'cancel'): Promise<void> {
    this.busy.set(true);
    try {
      await this.api.devBilling(action, this.selectedPlan(), this.selectedInterval());
      if (action === 'pay') await this.back(true);
      else this.toasts.show(this.translate.instant('dev.eventSent'), 'success');
    } catch (error) {
      this.toasts.show(this.translate.instant(errorMessageKey(error) ?? 'errors.unknown'), 'error');
    } finally {
      this.busy.set(false);
    }
  }

  protected async back(paid: boolean): Promise<void> {
    await this.router.navigate(['/app/settings/billing'], {
      queryParams: paid ? { checkout: 'done' } : {},
    });
  }
}

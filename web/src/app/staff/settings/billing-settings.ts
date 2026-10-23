import { Component, computed, inject, input, OnInit, signal } from '@angular/core';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  type BillingInfo,
  type BillingInterval,
  PAID_PLANS,
  type PaidPlan,
  PLAN_LIMITS,
  planFeatures,
  planPriceOre,
} from '@siteline/shared';

import { Api } from '../../core/api';
import { errorMessageKey } from '../../core/errors';
import { liveDoc } from '../../core/live';
import { Session } from '../../core/session';
import { DatePipe } from '../../shared/pipes/date';
import { MoneyPipe } from '../../shared/pipes/money';
import { PluralPipe } from '../../shared/pipes/plural';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { Toasts } from '../../shared/ui/toast';
import { CurrentCompany } from '../current-company';

/**
 * Plan, usage and subscription (PRD F10): plans to start in Stripe Checkout, the Customer
 * Portal for the card, plan changes and cancelling, and how many businesses the firm's clients
 * have brought in (F20). Owners only.
 */
@Component({
  selector: 'sl-billing-settings',
  imports: [TranslatePipe, DatePipe, MoneyPipe, PluralPipe, Button, Card],
  template: `
    <main class="sl-page sl-stack" id="main">
      <h1>{{ 'pages.settingsBilling' | translate }}</h1>
      @if (company.company(); as c) {
        @if (billing()?.status === 'past_due') {
          <p class="banner" role="alert">
            {{ 'billing.pastDue' | translate }}
            <button
              slButton="secondary"
              type="button"
              [busy]="busy() === 'portal'"
              (click)="portal()"
            >
              {{ 'billing.updateCard' | translate }}
            </button>
          </p>
        }
        <section slCard class="sl-stack" aria-labelledby="current-title">
          <p class="sl-label">{{ 'billing.currentPlan' | translate }}</p>
          <h2 id="current-title">{{ 'plans.' + company.plan() | translate }}</h2>
          @if (comped(); as until) {
            <p>{{ 'billing.comped' | translate: { date: (until | slDate: 'date') } }}</p>
          } @else if (billing()?.currentPeriodEnd && billing()?.status === 'active') {
            <p class="sl-small">
              {{
                'billing.renews'
                  | translate: { date: (billing()!.currentPeriodEnd | slDate: 'date') }
              }}
            </p>
          }
          <ul class="rows">
            @for (row of usage(); track row.key) {
              <li class="sl-stack">
                <span>{{
                  'billing.' + row.key | translate: { used: row.used, limit: row.limit ?? '∞' }
                }}</span>
                @if (row.limit !== null) {
                  <div class="meter" role="presentation">
                    <span [style.width.%]="Math.min(100, (row.used / row.limit) * 100)"></span>
                  </div>
                }
              </li>
            }
          </ul>
          @if (billing()?.customerId) {
            <div>
              <button
                slButton="secondary"
                type="button"
                [busy]="busy() === 'portal'"
                (click)="portal()"
              >
                {{ 'billing.manage' | translate }}
              </button>
            </div>
          }
        </section>

        <section class="sl-stack" aria-labelledby="plans-title">
          <div class="plans-head">
            <h2 id="plans-title">{{ 'billing.plansTitle' | translate }}</h2>
            <div
              class="interval"
              role="radiogroup"
              [attr.aria-label]="'billing.interval' | translate"
            >
              @for (option of intervals; track option) {
                <label [class.on]="interval() === option">
                  <input
                    type="radio"
                    name="interval"
                    [value]="option"
                    [checked]="interval() === option"
                    (change)="interval.set(option)"
                  />
                  {{ 'billing.' + option | translate }}
                </label>
              }
            </div>
          </div>
          <p class="sl-small">{{ 'billing.vatNote' | translate }}</p>
          <ul class="plans">
            @for (plan of plans; track plan.id) {
              <li slCard class="plan" [class.current]="plan.id === subscribedPlan()">
                <h3>{{ 'plans.' + plan.id | translate }}</h3>
                <p class="price">
                  {{ plan.price[interval()] | money }}
                  <span class="per">{{ 'billing.per.' + interval() | translate }}</span>
                </p>
                <ul class="includes">
                  <li>
                    {{
                      'billing.includes.projects'
                        | plural: plan.limits.activeProjects ?? 99
                        | translate: { count: plan.limits.activeProjects ?? '∞' }
                    }}
                  </li>
                  <li>
                    {{
                      'billing.includes.clients'
                        | translate: { count: plan.limits.serviceClients ?? '∞' }
                    }}
                  </li>
                  <li>
                    {{
                      'billing.includes.staff'
                        | plural: plan.limits.staff ?? 99
                        | translate: { count: plan.limits.staff ?? '∞' }
                    }}
                  </li>
                  @for (feature of plan.features; track feature) {
                    <li>{{ 'billing.features.' + feature | translate }}</li>
                  }
                </ul>
                @if (plan.id === subscribedPlan()) {
                  <p class="yours">{{ 'billing.yourPlan' | translate }}</p>
                } @else if (billing()?.subscriptionId && billing()?.status !== 'canceled') {
                  <button
                    slButton="secondary"
                    type="button"
                    [busy]="busy() === 'portal'"
                    (click)="portal()"
                  >
                    {{ 'billing.changeInPortal' | translate }}
                  </button>
                } @else {
                  <button
                    slButton
                    type="button"
                    [busy]="busy() === plan.id"
                    [disabled]="!!busy()"
                    (click)="startCheckout(plan.id)"
                  >
                    {{ 'billing.choose' | translate: { plan: ('plans.' + plan.id | translate) } }}
                  </button>
                }
              </li>
            }
          </ul>
        </section>

        <section slCard class="sl-stack" aria-labelledby="referrals-title">
          <h2 id="referrals-title">{{ 'billing.referralsTitle' | translate }}</h2>
          <p>
            {{
              'billing.referrals'
                | plural: c.referralSignups ?? 0
                | translate: { count: c.referralSignups ?? 0 }
            }}
          </p>
          @if (billing()?.pendingFreeMonths; as months) {
            <p>{{ 'billing.pendingMonths' | plural: months | translate: { count: months } }}</p>
          }
          <p class="sl-small">{{ 'billing.referralsHow' | translate }}</p>
        </section>
      }
    </main>
  `,
  styleUrl: './settings.css',
  styles: `
    .banner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--sl-space-3);
      padding: var(--sl-space-3) var(--sl-space-4);
      border-radius: var(--sl-radius-card);
      background: var(--sl-alert-tint);
      color: var(--sl-alert-text);
      font-weight: 600;
    }
    .plans-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--sl-space-3);
    }
    .interval {
      display: flex;
      gap: var(--sl-space-1);
      padding: var(--sl-space-1);
      border-radius: var(--sl-radius-pill);
      background: var(--sl-panel-2);
    }
    .interval label {
      display: flex;
      align-items: center;
      min-height: var(--sl-target);
      padding: 0 var(--sl-space-4);
      border-radius: var(--sl-radius-pill);
      font-weight: 600;
      cursor: pointer;
    }
    .interval label.on {
      background: var(--sl-surface);
      box-shadow: var(--sl-shadow-card);
    }
    .interval input {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }
    .interval label:has(input:focus-visible) {
      box-shadow: var(--sl-focus-ring);
    }
    .plans {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: var(--sl-space-4);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .plan {
      display: flex;
      flex-direction: column;
      gap: var(--sl-space-3);
    }
    .plan.current {
      outline: 2px solid var(--sl-accent);
    }
    .plan h3 {
      font: var(--sl-text-section);
    }
    .price {
      font: 800 26px/32px var(--sl-font-display);
    }
    .per {
      font: var(--sl-text-small);
      color: var(--sl-text-2);
    }
    .includes {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: var(--sl-space-1);
      margin: 0;
      padding-left: var(--sl-space-5);
    }
    .yours {
      font-weight: 600;
      color: var(--sl-accent-text);
    }
  `,
})
export class BillingSettings implements OnInit {
  protected readonly company = inject(CurrentCompany);
  private readonly session = inject(Session);
  private readonly api = inject(Api);
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);

  /** "done" after returning from checkout. */
  readonly checkout = input<string>();

  protected readonly Math = Math;
  protected readonly intervals: BillingInterval[] = ['month', 'year'];
  protected readonly interval = signal<BillingInterval>('month');
  protected readonly busy = signal<PaidPlan | 'portal' | null>(null);

  protected readonly billing = liveDoc<BillingInfo>(() => {
    const cid = this.session.claims().cid;
    return cid ? `companies/${cid}/private/billing` : null;
  });
  protected readonly subscribedPlan = computed(() => {
    const billing = this.billing();
    return billing?.subscriptionId && billing.status !== 'canceled' ? billing.plan : null;
  });
  protected readonly comped = computed(() => {
    const until = this.company.company()?.compedUntil;
    return until && until.toMillis() > Date.now() ? until : null;
  });
  protected readonly plans = PAID_PLANS.map((id) => {
    const features = planFeatures(id);
    return {
      id,
      limits: PLAN_LIMITS[id],
      price: { month: planPriceOre(id, 'month'), year: planPriceOre(id, 'year') },
      features: [
        id === 'visits' ? 'serviceMode' : null,
        features.logo ? 'logo' : null,
        features.conditionCheckIn ? 'conditionCheckIn' : null,
        features.colours ? 'colours' : null,
        features.aftercare ? 'aftercare' : null,
        features.footer ? null : 'noFooter',
      ].filter((f): f is string => !!f),
    };
  });
  protected readonly usage = computed(() => {
    const c = this.company.company();
    const limits = this.company.limits();
    if (!c || !limits) return [];
    return (['activeProjects', 'serviceClients', 'staff'] as const).map((key) => ({
      key,
      used: c.usage[key],
      limit: limits[key],
    }));
  });

  ngOnInit(): void {
    if (this.checkout() === 'done') {
      this.toasts.show(this.translate.instant('billing.checkoutDone'), 'success');
    }
  }

  protected async startCheckout(plan: PaidPlan): Promise<void> {
    await this.go(plan, () => this.api.createCheckoutSession(plan, this.interval()));
  }

  protected async portal(): Promise<void> {
    await this.go('portal', () => this.api.createPortalSession());
  }

  private async go(
    what: PaidPlan | 'portal',
    start: () => Promise<{ url: string }>,
  ): Promise<void> {
    this.busy.set(what);
    try {
      const { url } = await start();
      window.location.assign(url);
    } catch (error) {
      this.toasts.show(this.translate.instant(errorMessageKey(error) ?? 'errors.unknown'), 'error');
      this.busy.set(null);
    }
  }
}

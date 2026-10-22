import { Component, computed, inject } from '@angular/core';

import { TranslatePipe } from '@ngx-translate/core';

import { PluralPipe } from '../../shared/pipes/plural';
import { Card } from '../../shared/ui/card';
import { CurrentCompany } from '../current-company';

/**
 * Plan and usage, such as "3 of 5 active projects", and how many businesses the firm's clients
 * have brought in (F20). Upgrading with Stripe, and the referral reward, arrive in M4 (F10).
 */
@Component({
  selector: 'sl-billing-settings',
  imports: [TranslatePipe, PluralPipe, Card],
  template: `
    <main class="sl-page sl-stack" id="main">
      <h1>{{ 'pages.settingsBilling' | translate }}</h1>
      @if (company.company(); as c) {
        <section slCard class="sl-stack">
          <p class="sl-label">{{ 'billing.currentPlan' | translate }}</p>
          <h2>{{ 'plans.' + c.plan | translate }}</h2>
          <ul class="rows">
            @for (row of usage(); track row.key) {
              <li class="sl-stack">
                <span>{{
                  'billing.' + row.key | translate: { used: row.used, limit: row.limit ?? '∞' }
                }}</span>
                @if (row.limit !== null) {
                  <div class="meter" role="presentation">
                    <span [style.width.%]="(row.used / row.limit) * 100"></span>
                  </div>
                }
              </li>
            }
          </ul>
          <p class="sl-small">{{ 'billing.upgradeSoon' | translate }}</p>
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
          <p class="sl-small">{{ 'billing.referralsHow' | translate }}</p>
        </section>
      }
    </main>
  `,
  styleUrl: './settings.css',
})
export class BillingSettings {
  protected readonly company = inject(CurrentCompany);
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
}

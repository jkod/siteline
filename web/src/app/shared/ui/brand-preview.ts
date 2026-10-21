import { Component, input } from '@angular/core';

import { TranslatePipe } from '@ngx-translate/core';

import { Brand } from './brand';

/** How the client view will look with this name, logo and colour (PRD 11, onboarding). */
@Component({
  selector: 'sl-brand-preview',
  imports: [TranslatePipe, Brand],
  template: `
    <figure [slBrand]="accent()">
      <figcaption class="sl-label">{{ 'brandPreview.caption' | translate }}</figcaption>
      <div class="phone" aria-hidden="true">
        <div class="brand">
          @if (logoUrl(); as url) {
            <img [src]="url" alt="" width="32" height="32" />
          } @else {
            <span class="mark">{{ (name() || '?')[0] }}</span>
          }
          <span class="firm">{{ name() || ('brandPreview.yourFirm' | translate) }}</span>
        </div>
        <div class="card">
          <p class="sl-label">{{ 'brandPreview.extraWork' | translate }}</p>
          <p class="title">{{ 'brandPreview.sampleTitle' | translate }}</p>
          <p class="price">6 500 kr</p>
          <div class="buttons">
            <span class="approve">{{ 'brandPreview.approve' | translate }}</span>
            <span class="ask">{{ 'brandPreview.ask' | translate }}</span>
          </div>
        </div>
        <p class="link">{{ 'brandPreview.link' | translate }}</p>
      </div>
    </figure>
  `,
  styles: `
    figure {
      display: flex;
      flex-direction: column;
      gap: var(--sl-space-2);
      margin: 0;
    }
    .phone {
      display: flex;
      flex-direction: column;
      gap: var(--sl-space-3);
      padding: var(--sl-space-4);
      background: var(--sl-bg);
      border: 8px solid var(--sl-dark);
      border-radius: 32px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: var(--sl-space-2);
    }
    .brand img,
    .mark {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      object-fit: contain;
    }
    .mark {
      display: grid;
      place-items: center;
      background: var(--sl-accent);
      color: var(--sl-on-accent);
      font-weight: 800;
    }
    .firm {
      font: 800 16px/20px var(--sl-font-display);
    }
    .card {
      padding: var(--sl-space-4);
      background: var(--sl-surface);
      border-radius: var(--sl-radius-panel);
      box-shadow: var(--sl-shadow-card);
    }
    .title {
      font-weight: 700;
    }
    .price {
      margin: var(--sl-space-1) 0 var(--sl-space-3);
      font: 800 20px/24px var(--sl-font-display);
    }
    .buttons {
      display: flex;
      gap: var(--sl-space-2);
    }
    .approve,
    .ask {
      flex: 1;
      padding: var(--sl-space-2);
      border-radius: var(--sl-radius-pill);
      text-align: center;
      font: 600 13px/18px var(--sl-font-body);
    }
    .approve {
      background: var(--sl-accent);
      color: var(--sl-on-accent);
    }
    .ask {
      border: 1.5px solid var(--sl-border-control);
    }
    .link {
      color: var(--sl-accent-text);
      font-weight: 600;
      text-decoration: underline;
    }
  `,
})
export class BrandPreview {
  readonly name = input('');
  readonly accent = input('#127A69');
  readonly logoUrl = input<string | null>(null);
}

import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TranslatePipe } from '@ngx-translate/core';

import { Card } from '../shared/ui/card';

/** Section keys per page, in order; the text lives in the translation files. */
const SECTIONS = {
  privacy: ['who', 'what', 'where', 'why', 'how_long', 'rights', 'contact'],
  terms: ['service', 'accounts', 'content', 'payment', 'liability', 'changes'],
} as const;

/**
 * Placeholder privacy policy and terms (PRD M3), written plainly in both languages and marked
 * as drafts until counsel replaces them (PRD section 16).
 */
@Component({
  selector: 'sl-legal-page',
  imports: [TranslatePipe, RouterLink, Card],
  template: `
    <main class="sl-page sl-stack" id="main">
      <h1>{{ 'pages.' + page() | translate }}</h1>
      <p slCard="panel" class="draft" role="note">{{ 'legal.draft' | translate }}</p>
      @for (section of sections(); track section) {
        <section class="sl-stack" [attr.aria-labelledby]="'legal-' + section">
          <h2 [id]="'legal-' + section">
            {{ 'legal.' + page() + '.' + section + '.title' | translate }}
          </h2>
          <p>{{ 'legal.' + page() + '.' + section + '.body' | translate }}</p>
        </section>
      }
      <p class="sl-small">
        <a [routerLink]="['/legal', page() === 'privacy' ? 'terms' : 'privacy']">
          {{ (page() === 'privacy' ? 'pages.terms' : 'pages.privacy') | translate }}
        </a>
      </p>
    </main>
  `,
  styles: `
    h2 {
      font: var(--sl-text-section);
    }
    .draft {
      font-weight: 600;
    }
  `,
})
export class LegalPage {
  /** From route data. */
  readonly page = input.required<'privacy' | 'terms'>();
  protected readonly sections = computed(() => SECTIONS[this.page()]);
}

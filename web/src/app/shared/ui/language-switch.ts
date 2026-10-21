import { Component, inject } from '@angular/core';

import { TranslatePipe } from '@ngx-translate/core';

import { Language } from '../../core/language';

/** Switches between Swedish and English. Each option is named in its own language. */
@Component({
  selector: 'sl-language-switch',
  imports: [TranslatePipe],
  template: `
    <div class="switch" role="group" [attr.aria-label]="'language.label' | translate">
      @for (lang of language.available; track lang) {
        <button
          type="button"
          [attr.lang]="lang"
          [attr.aria-pressed]="language.lang() === lang"
          (click)="language.use(lang)"
        >
          {{ 'language.' + lang | translate }}
        </button>
      }
    </div>
  `,
  styles: `
    .switch {
      display: inline-flex;
      gap: var(--sl-space-1);
      padding: var(--sl-space-1);
      background: var(--sl-panel-2);
      border-radius: var(--sl-radius-pill);
    }
    button {
      min-height: var(--sl-target);
      padding: 0 var(--sl-space-4);
      border: 0;
      border-radius: var(--sl-radius-pill);
      background: transparent;
      color: var(--sl-text-2);
      font: 600 14px/18px var(--sl-font-body);
      cursor: pointer;
    }
    button[aria-pressed='true'] {
      background: var(--sl-surface);
      color: var(--sl-text);
      box-shadow: var(--sl-shadow-card);
    }
  `,
})
export class LanguageSwitch {
  protected readonly language = inject(Language);
}

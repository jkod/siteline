import { Component, input, type WritableSignal } from '@angular/core';

import { TranslatePipe, type TranslateService } from '@ngx-translate/core';

import { errorMessageKey } from '../../core/errors';
import type { Toasts } from './toast';

/**
 * A save error inside a dialog or form, where the person is looking (the toast alone could be
 * missed). Announced as an alert.
 */
@Component({
  selector: 'sl-form-error',
  imports: [TranslatePipe],
  template: `
    @if (key(); as k) {
      <p class="error" role="alert">{{ k | translate }}</p>
    }
  `,
  styles: `
    .error {
      padding: var(--sl-space-2) var(--sl-space-3);
      border-radius: var(--sl-radius-panel);
      background: var(--sl-alert-tint);
      color: var(--sl-alert-text);
      font-weight: 600;
    }
  `,
})
export class FormError {
  /** A translation key, or null for none. */
  readonly key = input<string | null>(null);
}

/** Shows a failed save both inline (in `inline`) and as a toast. */
export function showSaveError(
  error: unknown,
  inline: WritableSignal<string | null>,
  toasts: Toasts,
  translate: TranslateService,
): void {
  const key = errorMessageKey(error) ?? 'errors.unknown';
  inline.set(key);
  toasts.show(translate.instant(key) as string, 'error');
}

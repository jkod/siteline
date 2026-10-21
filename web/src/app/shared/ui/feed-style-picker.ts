import { Component, inject } from '@angular/core';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import type { FeedStyle } from '@siteline/shared';

import { errorMessageKey } from '../../core/errors';
import { Session } from '../../core/session';
import { Toasts } from './toast';

/** The person's feed order, saved on their profile: newest first, or newest last like a chat. */
@Component({
  selector: 'sl-feed-style-picker',
  imports: [TranslatePipe],
  template: `
    <fieldset>
      <legend>{{ 'feedStyle.label' | translate }}</legend>
      @for (option of options; track option) {
        <label>
          <input
            type="radio"
            name="feed-style"
            [value]="option"
            [checked]="session.feedStyle() === option"
            (change)="choose(option)"
          />
          {{ 'feedStyle.' + option | translate }}
        </label>
      }
    </fieldset>
  `,
  styles: `
    fieldset {
      display: flex;
      flex-direction: column;
      gap: var(--sl-space-1);
      margin: 0;
      padding: 0;
      border: 0;
    }
    legend {
      margin-bottom: var(--sl-space-2);
      font: 600 15px/20px var(--sl-font-body);
    }
    label {
      display: flex;
      align-items: center;
      gap: var(--sl-space-3);
      min-height: var(--sl-target);
    }
    input {
      width: 22px;
      height: 22px;
      accent-color: var(--sl-accent);
    }
  `,
})
export class FeedStylePicker {
  protected readonly session = inject(Session);
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);
  protected readonly options: FeedStyle[] = ['feed', 'chat'];

  protected async choose(style: FeedStyle): Promise<void> {
    try {
      await this.session.setFeedStyle(style);
      this.toasts.show(this.translate.instant('feedStyle.saved'), 'success');
    } catch (error) {
      const key = errorMessageKey(error);
      if (key) this.toasts.show(this.translate.instant(key), 'error');
    }
  }
}

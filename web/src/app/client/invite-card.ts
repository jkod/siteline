import {
  afterNextRender,
  Component,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { form, FormField } from '@angular/forms/signals';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { BUSINESS_KINDS, type BusinessKind } from '@siteline/shared';

import { Api } from '../core/api';
import { errorMessageKey } from '../core/errors';
import { Metrics } from '../core/metrics';
import { Button } from '../shared/ui/button';
import { Card } from '../shared/ui/card';
import { Field, Input } from '../shared/ui/field';
import { Icon } from '../shared/ui/icon';
import { Toasts } from '../shared/ui/toast';

/**
 * "Getting other work done at home? Invite them to Siteline." (PRD 4.5, F20). The client picks
 * the kind of business and shares the link through the phone's own share sheet, or copies it.
 * The message comes from the client; Siteline never sends invite texts.
 */
@Component({
  selector: 'sl-invite-card',
  imports: [TranslatePipe, FormField, Button, Card, Field, Input, Icon],
  template: `
    <section slCard class="sl-stack" aria-labelledby="invite-title">
      <h2 id="invite-title" tabindex="-1" #heading>{{ 'invite.title' | translate }}</h2>
      <p>{{ 'invite.body' | translate }}</p>
      <sl-field [label]="'invite.kind' | translate">
        <select slInput [formField]="form.kind">
          @for (kind of kinds; track kind) {
            <option [value]="kind">{{ 'invite.kinds.' + kind | translate }}</option>
          }
        </select>
      </sl-field>
      <label class="check">
        <input type="checkbox" [formField]="form.showFirstName" />
        {{ 'invite.showFirstName' | translate }}
      </label>
      <div>
        <button slButton type="button" [busy]="busy()" [disabled]="busy()" (click)="share()">
          <sl-icon name="share" [size]="20" />
          {{ 'invite.share' | translate }}
        </button>
      </div>
      <p class="sl-small">{{ 'invite.private' | translate }}</p>
    </section>
  `,
  styles: `
    h2 {
      font: var(--sl-text-section);
    }
    h2:focus {
      outline: none;
    }
    .check {
      display: flex;
      align-items: center;
      gap: var(--sl-space-3);
      min-height: var(--sl-target);
    }
    .check input {
      width: 22px;
      height: 22px;
      accent-color: var(--sl-accent);
    }
  `,
})
export class InviteCard {
  private readonly api = inject(Api);
  private readonly metrics = inject(Metrics);
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);

  /** The project the invite comes from: the client's most recent. */
  readonly projectId = input.required<string>();
  readonly companyId = input.required<string>();
  /** Scroll to the card and focus it, as when arriving from the digest's invite link. */
  readonly focus = input(false);

  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');
  protected readonly kinds = BUSINESS_KINDS;
  protected readonly busy = signal(false);
  protected readonly model = signal({ kind: 'garden' as BusinessKind, showFirstName: true });
  protected readonly form = form(this.model);

  constructor() {
    afterNextRender(() => {
      this.metrics.track('invite_card_shown', this.where());
      if (this.focus()) {
        this.heading().nativeElement.scrollIntoView({ block: 'center' });
        this.heading().nativeElement.focus({ preventScroll: true });
      }
    });
  }

  protected async share(): Promise<void> {
    const { kind, showFirstName } = this.model();
    this.busy.set(true);
    try {
      const { url } = await this.api.createReferral({
        projectId: this.projectId(),
        businessKind: kind,
        showFirstName,
      });
      const text = this.translate.instant('invite.message') as string;
      let method: 'share' | 'copy';
      if (navigator.share) {
        try {
          await navigator.share({ text, url });
        } catch (error) {
          // Closing the share sheet isn't sharing.
          if ((error as Error).name === 'AbortError') return;
          throw error;
        }
        method = 'share';
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        this.toasts.show(this.translate.instant('invite.copied'), 'success');
        method = 'copy';
      }
      this.metrics.track('invite_shared', this.where(), { kind, method });
    } catch (error) {
      this.toasts.show(this.translate.instant(errorMessageKey(error) ?? 'errors.unknown'), 'error');
    } finally {
      this.busy.set(false);
    }
  }

  private where() {
    return { projectId: this.projectId(), companyId: this.companyId() };
  }
}

import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { Api } from '../../core/api';
import { errorMessageKey } from '../../core/errors';
import { Button } from '../ui/button';
import { dialogTitleId } from '../ui/dialog';
import { Field, Input } from '../ui/field';
import { Toasts } from '../ui/toast';
import { toInstant } from './visit-time';

export interface VisitRequestDialogData {
  projectId: string;
  visitId: string;
  when: string;
  /** Staff answering a request with another time use the same form. */
  mode: 'client' | 'suggest';
  requestId?: string;
}

/** A client asks to move or cancel one visit; staff can answer with another time (PRD 4.4). */
@Component({
  selector: 'sl-visit-request-dialog',
  imports: [TranslatePipe, Button, Field, Input],
  template: `
    <form class="body" (submit)="send($event)">
      <h2 [id]="titleId">
        {{
          (data.mode === 'client' ? 'visits.requestTitle' : 'visits.suggestTitle')
            | translate: { when: data.when }
        }}
      </h2>
      @if (data.mode === 'client') {
        <div class="segments" role="group" [attr.aria-label]="'visits.requestKind' | translate">
          <button type="button" [attr.aria-pressed]="kind() === 'move'" (click)="kind.set('move')">
            {{ 'visits.move' | translate }}
          </button>
          <button
            type="button"
            [attr.aria-pressed]="kind() === 'cancel'"
            (click)="kind.set('cancel')"
          >
            {{ 'visits.cancel' | translate }}
          </button>
        </div>
      }
      @if (kind() === 'move') {
        <div class="pair">
          <sl-field [label]="'visits.date' | translate">
            <input
              slInput
              type="date"
              required
              [value]="date()"
              (input)="date.set($any($event.target).value)"
            />
          </sl-field>
          <sl-field [label]="'visits.start' | translate">
            <input
              slInput
              type="time"
              required
              [value]="time()"
              (input)="time.set($any($event.target).value)"
            />
          </sl-field>
        </div>
      }
      @if (data.mode === 'client') {
        <sl-field [label]="'visits.requestNote' | translate" [hint]="'common.optional' | translate">
          <textarea
            slInput
            rows="2"
            maxlength="500"
            [value]="note()"
            (input)="note.set($any($event.target).value)"
          ></textarea>
        </sl-field>
      }
      <div class="actions">
        <button slButton="secondary" type="button" (click)="ref.close()">
          {{ 'common.cancel' | translate }}
        </button>
        <button
          slButton
          type="submit"
          [busy]="sending()"
          [disabled]="sending() || (kind() === 'move' && (!date() || !time()))"
        >
          {{ (data.mode === 'client' ? 'visits.sendRequest' : 'visits.suggest') | translate }}
        </button>
      </div>
    </form>
  `,
  styles: `
    .body {
      display: flex;
      flex-direction: column;
      gap: var(--sl-space-4);
      padding: var(--sl-space-6);
    }
    .segments {
      display: flex;
      gap: var(--sl-space-1);
      padding: var(--sl-space-1);
      background: var(--sl-panel-2);
      border-radius: var(--sl-radius-pill);
    }
    .segments button {
      flex: 1;
      min-height: var(--sl-target);
      border: 0;
      border-radius: var(--sl-radius-pill);
      background: transparent;
      color: var(--sl-text-2);
      font: 600 14px/18px var(--sl-font-body);
      cursor: pointer;
    }
    .segments button[aria-pressed='true'] {
      background: var(--sl-surface);
      color: var(--sl-text);
      box-shadow: var(--sl-shadow-card);
    }
    .pair {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--sl-space-3);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--sl-space-3);
    }
  `,
})
export class VisitRequestDialog {
  private readonly api = inject(Api);
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);
  protected readonly ref = inject(DialogRef);
  protected readonly data = inject<VisitRequestDialogData>(DIALOG_DATA);
  protected readonly titleId = dialogTitleId(this.ref);
  protected readonly kind = signal<'move' | 'cancel'>('move');
  protected readonly date = signal('');
  protected readonly time = signal('');
  protected readonly note = signal('');
  protected readonly sending = signal(false);

  protected async send(event: Event): Promise<void> {
    event.preventDefault();
    const startAt =
      this.kind() === 'move' && this.date() && this.time()
        ? toInstant(this.date(), this.time()).toISOString()
        : null;
    this.sending.set(true);
    try {
      if (this.data.mode === 'client') {
        await this.api.requestVisitChange({
          projectId: this.data.projectId,
          visitId: this.data.visitId,
          kind: this.kind(),
          proposedStartAt: startAt,
          note: this.note().trim(),
        });
        this.toasts.show(this.translate.instant('visits.requestSent'), 'success');
      } else {
        await this.api.respondVisitChange({
          projectId: this.data.projectId,
          requestId: this.data.requestId!,
          accept: true,
          startAt,
        });
      }
      this.ref.close();
    } catch (error) {
      const key = errorMessageKey(error);
      if (key) this.toasts.show(this.translate.instant(key), 'error');
    } finally {
      this.sending.set(false);
    }
  }
}

import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { Api } from '../core/api';
import { Button } from '../shared/ui/button';
import { dialogTitleId } from '../shared/ui/dialog';
import { Field, Input } from '../shared/ui/field';
import { FormError, showSaveError } from '../shared/ui/form-error';
import { Toasts } from '../shared/ui/toast';

export interface BookingData {
  projectId: string;
  firm: string;
  reminderId: string | null;
}

/** "Book {firm} again" (PRD F13): an optional note, then a request the firm sees at once. */
@Component({
  selector: 'sl-booking-dialog',
  imports: [TranslatePipe, Button, Field, Input, FormError],
  template: `
    <form class="body" (submit)="$event.preventDefault(); send()">
      <h2 [id]="titleId">{{ 'booking.title' | translate: { firm: data.firm } }}</h2>
      <p>{{ 'booking.body' | translate: { firm: data.firm } }}</p>
      <sl-field [label]="'booking.note' | translate" [hint]="'common.optional' | translate">
        <textarea
          slInput
          rows="3"
          maxlength="1000"
          [value]="note()"
          (input)="note.set($any($event.target).value)"
        ></textarea>
      </sl-field>
      <sl-form-error [key]="saveError()" />
      <div class="actions">
        <button slButton="secondary" type="button" (click)="ref.close()">
          {{ 'common.cancel' | translate }}
        </button>
        <button slButton type="submit" [busy]="busy()" [disabled]="busy()">
          {{ 'booking.send' | translate }}
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
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--sl-space-3);
    }
  `,
})
export class BookingDialog {
  /** A failed save, shown in the dialog as well as in a toast. */
  protected readonly saveError = signal<string | null>(null);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly data = inject<BookingData>(DIALOG_DATA);
  private readonly api = inject(Api);
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);
  protected readonly titleId = dialogTitleId(this.ref);
  protected readonly note = signal('');
  protected readonly busy = signal(false);

  protected async send(): Promise<void> {
    this.busy.set(true);
    try {
      await this.api.requestBooking(this.data.projectId, this.data.reminderId, this.note().trim());
      this.toasts.show(this.translate.instant('booking.sent', { firm: this.data.firm }), 'success');
      this.ref.close(true);
    } catch (error) {
      showSaveError(error, this.saveError, this.toasts, this.translate);
      this.busy.set(false);
    }
  }
}

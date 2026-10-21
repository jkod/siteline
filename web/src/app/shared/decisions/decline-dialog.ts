import { DialogRef } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';

import { TranslatePipe } from '@ngx-translate/core';

import { Button } from '../ui/button';
import { dialogTitleId } from '../ui/dialog';
import { Field, Input } from '../ui/field';

/** Declining, with an optional reason (PRD F6). */
@Component({
  selector: 'sl-decline-dialog',
  imports: [TranslatePipe, Button, Field, Input],
  template: `
    <form class="body" (submit)="$event.preventDefault(); ref.close({ reason: reason().trim() })">
      <h2 [id]="titleId">{{ 'decisions.declineTitle' | translate }}</h2>
      <sl-field
        [label]="'decisions.declineReason' | translate"
        [hint]="'common.optional' | translate"
      >
        <textarea
          slInput
          rows="3"
          maxlength="500"
          [value]="reason()"
          (input)="reason.set($any($event.target).value)"
        ></textarea>
      </sl-field>
      <div class="actions">
        <button slButton="secondary" type="button" (click)="ref.close()">
          {{ 'common.cancel' | translate }}
        </button>
        <button slButton="danger" type="submit">{{ 'decisions.decline' | translate }}</button>
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
export class DeclineDialog {
  protected readonly ref = inject<DialogRef<{ reason: string }>>(DialogRef);
  protected readonly titleId = dialogTitleId(this.ref);
  protected readonly reason = signal('');
}

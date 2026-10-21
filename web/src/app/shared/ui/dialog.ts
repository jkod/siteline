import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, Injectable, type Type } from '@angular/core';

import { firstValueFrom } from 'rxjs';

import { Button } from './button';

let nextId = 0;

/**
 * Opens modal dialogs on the CDK, which traps focus, closes on Escape and returns focus to the
 * control that opened it. Dialog components label themselves with `dialogTitleId(ref)`.
 */
@Injectable({ providedIn: 'root' })
export class Dialogs {
  private readonly dialog = inject(Dialog);

  open<R, D, C>(component: Type<C>, data?: D): DialogRef<R, C> {
    const id = `sl-dialog-${nextId++}`;
    return this.dialog.open<R, D, C>(component, {
      data,
      id,
      ariaLabelledBy: `${id}-title`,
      ariaModal: true,
      panelClass: 'sl-dialog-panel',
      backdropClass: 'sl-dialog-backdrop',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
    });
  }

  async confirm(options: ConfirmOptions): Promise<boolean> {
    const ref = this.open<boolean, ConfirmOptions, ConfirmDialog>(ConfirmDialog, options);
    return (await firstValueFrom(ref.closed)) === true;
  }
}

/** The id of the dialog's title element, which `aria-labelledby` points to. */
export function dialogTitleId(ref: Pick<DialogRef, 'id'>): string {
  return `${ref.id}-title`;
}

export interface ConfirmOptions {
  /** Already translated. */
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
}

@Component({
  selector: 'sl-confirm-dialog',
  imports: [Button],
  template: `
    <div class="body">
      <h2 [id]="titleId">{{ data.title }}</h2>
      <p>{{ data.message }}</p>
    </div>
    <div class="actions">
      <button slButton="secondary" type="button" (click)="ref.close(false)">
        {{ data.cancelLabel }}
      </button>
      <button
        [slButton]="data.danger ? 'danger' : 'primary'"
        type="button"
        (click)="ref.close(true)"
      >
        {{ data.confirmLabel }}
      </button>
    </div>
  `,
  styles: `
    .body {
      display: flex;
      flex-direction: column;
      gap: var(--sl-space-3);
      padding: var(--sl-space-6) var(--sl-space-6) var(--sl-space-4);
    }
    p {
      color: var(--sl-text-2);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--sl-space-3);
      padding: var(--sl-space-4) var(--sl-space-6) var(--sl-space-6);
    }
  `,
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmOptions>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly titleId = dialogTitleId(this.ref);
}

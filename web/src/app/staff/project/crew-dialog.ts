import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { Api } from '../../core/api';
import { Button } from '../../shared/ui/button';
import { dialogTitleId } from '../../shared/ui/dialog';
import { FormError, showSaveError } from '../../shared/ui/form-error';
import { Toasts } from '../../shared/ui/toast';

export interface CrewDialogData {
  projectId: string;
  options: { id: string; name: string }[];
  selected: string[];
}

/** Picks the crew assigned to a project. */
@Component({
  selector: 'sl-crew-dialog',
  imports: [TranslatePipe, Button, FormError],
  template: `
    <div class="body">
      <h2 [id]="titleId">{{ 'people.crewTitle' | translate }}</h2>
      @if (data.options.length) {
        <fieldset>
          <legend class="sl-visually-hidden">{{ 'people.crewTitle' | translate }}</legend>
          @for (option of data.options; track option.id) {
            <label>
              <input
                type="checkbox"
                [checked]="selected().includes(option.id)"
                (change)="toggle(option.id, $any($event.target).checked)"
              />
              {{ option.name }}
            </label>
          }
        </fieldset>
      } @else {
        <p>{{ 'people.noCrewInCompany' | translate }}</p>
      }
      <sl-form-error [key]="saveError()" />
      <div class="actions">
        <button slButton="secondary" type="button" (click)="ref.close()">
          {{ 'common.cancel' | translate }}
        </button>
        <button slButton type="button" [busy]="saving()" [disabled]="saving()" (click)="save()">
          {{ 'common.save' | translate }}
        </button>
      </div>
    </div>
  `,
  styles: `
    .body {
      display: flex;
      flex-direction: column;
      gap: var(--sl-space-4);
      padding: var(--sl-space-6);
    }
    fieldset {
      display: flex;
      flex-direction: column;
      margin: 0;
      padding: 0;
      border: 0;
    }
    label {
      display: flex;
      align-items: center;
      gap: var(--sl-space-3);
      min-height: var(--sl-target);
    }
    input {
      width: 20px;
      height: 20px;
      accent-color: var(--sl-accent);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--sl-space-3);
    }
  `,
})
export class CrewDialog {
  /** A failed save, shown in the dialog as well as in a toast. */
  protected readonly saveError = signal<string | null>(null);
  private readonly api = inject(Api);
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);
  protected readonly ref = inject(DialogRef);
  protected readonly data = inject<CrewDialogData>(DIALOG_DATA);
  protected readonly titleId = dialogTitleId(this.ref);
  protected readonly selected = signal([...this.data.selected]);
  protected readonly saving = signal(false);

  protected toggle(id: string, on: boolean): void {
    this.selected.update((list) => (on ? [...list, id] : list.filter((x) => x !== id)));
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    try {
      await this.api.assignCrew(this.data.projectId, this.selected());
      this.ref.close();
    } catch (error) {
      showSaveError(error, this.saveError, this.toasts, this.translate);
    } finally {
      this.saving.set(false);
    }
  }
}

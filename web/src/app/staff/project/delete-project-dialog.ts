import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { Api } from '../../core/api';
import { saveFile } from '../../core/download';
import { Button } from '../../shared/ui/button';
import { dialogTitleId } from '../../shared/ui/dialog';
import { Field, Input } from '../../shared/ui/field';
import { FormError, showSaveError } from '../../shared/ui/form-error';
import { Toasts } from '../../shared/ui/toast';

export interface DeleteProjectData {
  projectId: string;
  title: string;
}

/**
 * Deleting a project (PRD F11): first a chance to save the decisions, since they may be needed
 * as evidence for years, then the project's name typed again. Closes with true once deleted.
 */
@Component({
  selector: 'sl-delete-project-dialog',
  imports: [TranslatePipe, Button, Field, Input, FormError],
  template: `
    <form class="body" (submit)="$event.preventDefault(); confirm()">
      <h2 [id]="titleId">{{ 'deleteProject.title' | translate }}</h2>
      <p>{{ 'deleteProject.body' | translate }}</p>
      <p class="keep">{{ 'deleteProject.keepRecords' | translate }}</p>
      <div>
        <button slButton="secondary" type="button" (click)="saveDecisions()">
          {{ 'deleteProject.saveDecisions' | translate }}
        </button>
      </div>
      <sl-field [label]="'deleteProject.typeName' | translate: { name: data.title }">
        <input
          slInput
          type="text"
          autocomplete="off"
          [value]="typed()"
          (input)="typed.set($any($event.target).value)"
        />
      </sl-field>
      <sl-form-error [key]="saveError()" />
      <div class="actions">
        <button slButton="secondary" type="button" (click)="ref.close()">
          {{ 'common.cancel' | translate }}
        </button>
        <button slButton="danger" type="submit" [busy]="busy()" [disabled]="!matches() || busy()">
          {{ 'deleteProject.confirm' | translate }}
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
    .keep {
      font-weight: 600;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--sl-space-3);
    }
  `,
})
export class DeleteProjectDialog {
  /** A failed save, shown in the dialog as well as in a toast. */
  protected readonly saveError = signal<string | null>(null);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly data = inject<DeleteProjectData>(DIALOG_DATA);
  private readonly api = inject(Api);
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);

  protected readonly titleId = dialogTitleId(this.ref);
  protected readonly typed = signal('');
  protected readonly busy = signal(false);
  protected readonly matches = computed(() => this.typed().trim() === this.data.title.trim());

  protected async saveDecisions(): Promise<void> {
    try {
      const { csv, filename } = await this.api.exportDecisionsCsv(this.data.projectId);
      saveFile(csv, filename, 'text/csv;charset=utf-8');
    } catch (error) {
      this.showError(error);
    }
  }

  protected async confirm(): Promise<void> {
    if (!this.matches()) return;
    this.busy.set(true);
    try {
      await this.api.deleteProject(this.data.projectId, this.typed());
      this.ref.close(true);
    } catch (error) {
      this.showError(error);
      this.busy.set(false);
    }
  }

  private showError(error: unknown): void {
    showSaveError(error, this.saveError, this.toasts, this.translate);
  }
}

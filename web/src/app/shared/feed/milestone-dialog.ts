import { DialogRef } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';
import { form, FormField, max, maxLength, min, required, submit } from '@angular/forms/signals';

import { TranslatePipe } from '@ngx-translate/core';

import { Button } from '../ui/button';
import { dialogTitleId } from '../ui/dialog';
import { Field, Input } from '../ui/field';

export interface MilestoneResult {
  name: string;
  stage: number | null;
  stageCount: number | null;
}

/** A named stage, such as "Plumbing done", optionally "stage 3 of 4" (PRD F4). */
@Component({
  selector: 'sl-milestone-dialog',
  imports: [TranslatePipe, FormField, Button, Field, Input],
  template: `
    <form class="body" novalidate (submit)="save($event)">
      <h2 [id]="titleId">{{ 'milestone.title' | translate }}</h2>
      <sl-field
        [label]="'milestone.name' | translate"
        [hint]="'milestone.nameHint' | translate"
        [errors]="form.name().errors()"
        [touched]="form.name().touched()"
      >
        <input slInput type="text" autocomplete="off" [formField]="form.name" />
      </sl-field>
      <div class="pair">
        <sl-field
          [label]="'milestone.stage' | translate"
          [errors]="form.stage().errors()"
          [touched]="form.stage().touched()"
        >
          <input slInput type="number" inputmode="numeric" [formField]="form.stage" />
        </sl-field>
        <sl-field
          [label]="'milestone.of' | translate"
          [errors]="form.stageCount().errors()"
          [touched]="form.stageCount().touched()"
        >
          <input slInput type="number" inputmode="numeric" [formField]="form.stageCount" />
        </sl-field>
      </div>
      <div class="actions">
        <button slButton="secondary" type="button" (click)="ref.close()">
          {{ 'common.cancel' | translate }}
        </button>
        <button slButton type="submit">{{ 'milestone.post' | translate }}</button>
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
export class MilestoneDialog {
  protected readonly ref = inject<DialogRef<MilestoneResult>>(DialogRef);
  protected readonly titleId = dialogTitleId(this.ref);
  protected readonly model = signal<{
    name: string;
    stage: number | null;
    stageCount: number | null;
  }>({
    name: '',
    stage: null,
    stageCount: null,
  });
  protected readonly form = form(this.model, (path) => {
    required(path.name);
    maxLength(path.name, 120);
    min(path.stage, 1);
    max(path.stage, 20);
    min(path.stageCount, 1);
    max(path.stageCount, 20);
  });

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.form, async () => {
      const { name, stage, stageCount } = this.model();
      this.ref.close({ name: name.trim(), stage: stage || null, stageCount: stageCount || null });
      return undefined;
    });
  }
}

import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';
import {
  form,
  FormField,
  max,
  maxLength,
  min,
  required,
  submit,
  validate,
} from '@angular/forms/signals';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import type { Visit } from '@siteline/shared';

import { errorMessageKey } from '../../core/errors';
import { useFirestore, type WithId } from '../../core/live';
import { Button } from '../ui/button';
import { dialogTitleId } from '../ui/dialog';
import { Field, Input } from '../ui/field';
import { Toasts } from '../ui/toast';
import { fromInstant, toInstant } from './visit-time';

export interface VisitEditorData {
  projectId: string;
  companyId: string;
  visit?: WithId<Visit>;
}

/** Books or changes a visit: date, start, optional end, people and notes (PRD F7). */
@Component({
  selector: 'sl-visit-editor',
  imports: [TranslatePipe, FormField, Button, Field, Input],
  template: `
    <form class="body" novalidate (submit)="save($event)">
      <h2 [id]="titleId">
        {{ (data.visit ? 'visits.editTitle' : 'visits.newTitle') | translate }}
      </h2>
      <sl-field
        [label]="'visits.date' | translate"
        [errors]="form.date().errors()"
        [touched]="form.date().touched()"
      >
        <input slInput type="date" [formField]="form.date" />
      </sl-field>
      <div class="pair">
        <sl-field
          [label]="'visits.start' | translate"
          [errors]="form.start().errors()"
          [touched]="form.start().touched()"
        >
          <input slInput type="time" [formField]="form.start" />
        </sl-field>
        <sl-field
          [label]="'visits.end' | translate"
          [hint]="'common.optional' | translate"
          [errors]="form.end().errors()"
          [touched]="form.end().touched()"
        >
          <input slInput type="time" [formField]="form.end" />
        </sl-field>
      </div>
      <sl-field
        [label]="'visits.people' | translate"
        [hint]="'common.optional' | translate"
        [errors]="form.people().errors()"
        [touched]="form.people().touched()"
      >
        <input slInput type="number" inputmode="numeric" [formField]="form.people" />
      </sl-field>
      <sl-field [label]="'visits.notes' | translate" [hint]="'visits.notesHint' | translate">
        <textarea slInput rows="2" [formField]="form.notes"></textarea>
      </sl-field>
      <div class="actions">
        <button slButton="secondary" type="button" (click)="ref.close()">
          {{ 'common.cancel' | translate }}
        </button>
        <button slButton type="submit" [busy]="saving()" [disabled]="saving()">
          {{ 'common.save' | translate }}
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
export class VisitEditor {
  private readonly firestore = useFirestore();
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);
  protected readonly ref = inject(DialogRef);
  protected readonly data = inject<VisitEditorData>(DIALOG_DATA);
  protected readonly titleId = dialogTitleId(this.ref);
  protected readonly saving = signal(false);

  private readonly start = this.data.visit ? fromInstant(this.data.visit.startAt) : null;
  protected readonly model = signal({
    date: this.start?.date ?? '',
    start: this.start?.time ?? '07:30',
    end: this.data.visit?.endAt ? fromInstant(this.data.visit.endAt).time : '',
    people: this.data.visit?.people ?? null,
    notes: this.data.visit?.notes ?? '',
  });
  protected readonly form = form(this.model, (path) => {
    required(path.date);
    required(path.start);
    min(path.people, 1);
    max(path.people, 50);
    maxLength(path.notes, 500);
    validate(path.end, ({ value, valueOf }) =>
      value() && value() <= valueOf(path.start) ? { kind: 'endBeforeStart' } : null,
    );
  });

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.form, async () => {
      const m = this.model();
      this.saving.set(true);
      try {
        await this.firestore(async (db, fs) => {
          const fields = {
            startAt: fs.Timestamp.fromDate(toInstant(m.date, m.start)),
            endAt: m.end ? fs.Timestamp.fromDate(toInstant(m.date, m.end)) : null,
            people: m.people || null,
            notes: m.notes.trim(),
            updatedAt: fs.serverTimestamp(),
          };
          if (this.data.visit) {
            await fs.updateDoc(
              fs.doc(db, 'projects', this.data.projectId, 'visits', this.data.visit.id),
              fields,
            );
          } else {
            await fs.addDoc(fs.collection(db, 'projects', this.data.projectId, 'visits'), {
              ...fields,
              companyId: this.data.companyId,
              status: 'planned',
              fromSchedule: false,
              reportPostId: null,
              createdAt: fs.serverTimestamp(),
            });
          }
        });
        this.ref.close();
      } catch (error) {
        const key = errorMessageKey(error);
        if (key) this.toasts.show(this.translate.instant(key), 'error');
      } finally {
        this.saving.set(false);
      }
      return undefined;
    });
  }
}

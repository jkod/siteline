import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { Api } from '../../core/api';
import { MediaService } from '../../core/media';
import { PhotoTooLargeError } from '../../core/photos';
import { Button } from '../ui/button';
import { dialogTitleId } from '../ui/dialog';
import { Field, Input } from '../ui/field';
import { FormError, showSaveError } from '../ui/form-error';
import { Toasts } from '../ui/toast';

interface Item {
  file: File;
  preview: string;
  note: string;
  location: string;
}

/**
 * A condition check-in (PRD F12): photos of what was already there, each with a note and a
 * place, such as "Scratch, hall floor". The client acknowledges it with one tap.
 */
@Component({
  selector: 'sl-condition-dialog',
  imports: [TranslatePipe, Button, Field, Input, FormError],
  template: `
    <form class="body" (submit)="$event.preventDefault(); publish()">
      <h2 [id]="titleId">{{ 'condition.title' | translate }}</h2>
      <p class="sl-small">{{ 'condition.intro' | translate }}</p>
      <div class="items">
        @for (item of items(); track item.preview; let i = $index) {
          <fieldset class="item">
            <legend>{{ 'condition.photoN' | translate: { n: i + 1 } }}</legend>
            <img [src]="item.preview" alt="" />
            <div class="fields">
              <sl-field [label]="'condition.note' | translate">
                <input
                  slInput
                  type="text"
                  maxlength="300"
                  required
                  [value]="item.note"
                  (input)="set(i, 'note', $any($event.target).value)"
                />
              </sl-field>
              <sl-field
                [label]="'condition.location' | translate"
                [hint]="'common.optional' | translate"
              >
                <input
                  slInput
                  type="text"
                  maxlength="120"
                  [value]="item.location"
                  (input)="set(i, 'location', $any($event.target).value)"
                />
              </sl-field>
              <div>
                <button slButton="ghost" type="button" (click)="remove(i)">
                  {{ 'common.remove' | translate }}
                </button>
              </div>
            </div>
          </fieldset>
        }
      </div>
      <input
        #files
        type="file"
        accept="image/*"
        multiple
        class="sl-visually-hidden"
        tabindex="-1"
        aria-hidden="true"
        (change)="add($any($event.target).files); files.value = ''"
      />
      <div>
        <button
          slButton="secondary"
          type="button"
          [disabled]="items().length >= 20"
          (click)="files.click()"
        >
          {{ 'condition.addPhotos' | translate }}
        </button>
      </div>
      <sl-form-error [key]="saveError()" />
      <div class="actions">
        <button slButton="secondary" type="button" (click)="ref.close()">
          {{ 'common.cancel' | translate }}
        </button>
        <button slButton type="submit" [busy]="busy()" [disabled]="busy() || !ready()">
          {{ 'condition.publish' | translate }}
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
      max-height: 90dvh;
      overflow-y: auto;
    }
    .items {
      display: grid;
      gap: var(--sl-space-3);
    }
    @media (min-width: 1024px) {
      .items {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    .item {
      display: flex;
      flex-wrap: wrap;
      gap: var(--sl-space-3);
      margin: 0;
      padding: var(--sl-space-3);
      border: 1px solid var(--sl-border);
      border-radius: var(--sl-radius-panel);
    }
    .item legend {
      font-weight: 600;
    }
    .item img {
      width: 120px;
      height: 90px;
      object-fit: cover;
      border-radius: 10px;
    }
    .fields {
      display: flex;
      flex: 1 1 220px;
      flex-direction: column;
      gap: var(--sl-space-2);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--sl-space-3);
    }
  `,
})
export class ConditionDialog {
  /** A failed save, shown in the dialog as well as in a toast. */
  protected readonly saveError = signal<string | null>(null);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly data = inject<{ projectId: string }>(DIALOG_DATA);
  private readonly api = inject(Api);
  private readonly media = inject(MediaService);
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);
  protected readonly titleId = dialogTitleId(this.ref);
  protected readonly items = signal<Item[]>([]);
  protected readonly busy = signal(false);

  protected ready(): boolean {
    return this.items().length > 0 && this.items().every((i) => i.note.trim());
  }

  protected add(files: FileList | null): void {
    const chosen = Array.from(files ?? []).filter((f) => f.type.startsWith('image/'));
    this.items.update((list) =>
      [
        ...list,
        ...chosen.map((file) => ({
          file,
          preview: URL.createObjectURL(file),
          note: '',
          location: '',
        })),
      ].slice(0, 20),
    );
  }

  protected set(index: number, field: 'note' | 'location', value: string): void {
    this.items.update((list) =>
      list.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
  }

  protected remove(index: number): void {
    URL.revokeObjectURL(this.items()[index]!.preview);
    this.items.update((list) => list.filter((_, i) => i !== index));
  }

  protected async publish(): Promise<void> {
    if (!this.ready()) return;
    this.busy.set(true);
    try {
      const media = [];
      for (const item of this.items()) {
        media.push(
          await this.media.upload(this.data.projectId, item.file, () => undefined, ['condition']),
        );
      }
      await this.api.postConditionReport({
        projectId: this.data.projectId,
        media,
        items: this.items().map((item, mediaIndex) => ({
          mediaIndex,
          note: item.note.trim(),
          location: item.location.trim(),
        })),
      });
      this.items().forEach((item) => URL.revokeObjectURL(item.preview));
      this.ref.close(true);
    } catch (error) {
      if (error instanceof PhotoTooLargeError) {
        this.saveError.set('composer.photoTooLarge');
        this.toasts.show(this.translate.instant('composer.photoTooLarge'), 'error');
      } else {
        showSaveError(error, this.saveError, this.toasts, this.translate);
      }
      this.busy.set(false);
    }
  }
}

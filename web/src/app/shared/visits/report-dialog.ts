import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import type { Media, ReportTemplate } from '@siteline/shared';

import { Api } from '../../core/api';
import { errorMessageKey } from '../../core/errors';
import { MediaService } from '../../core/media';
import { Button } from '../ui/button';
import { dialogTitleId } from '../ui/dialog';
import { FormError, showSaveError } from '../ui/form-error';
import { Icon } from '../ui/icon';
import { StorageImage } from '../ui/storage-image';
import { Toasts } from '../ui/toast';

export interface ReportDialogData {
  projectId: string;
  visitId: string;
  /** "Tue 4 Nov at 15:00", for the heading. */
  when: string;
  template: ReportTemplate;
  photosAllowed: boolean;
}

type Rating = 'good' | 'ok' | 'hard';

/**
 * A visit report in under a minute (PRD 4.4): tick what was done from the template, add a note,
 * flags and items for next time, and photos where allowed.
 */
@Component({
  selector: 'sl-report-dialog',
  imports: [Icon, TranslatePipe, Button, StorageImage, FormError],
  templateUrl: './report-dialog.html',
  styleUrl: './report-dialog.css',
})
export class ReportDialog {
  /** A failed save, shown in the dialog as well as in a toast. */
  protected readonly saveError = signal<string | null>(null);
  private readonly api = inject(Api);
  private readonly media = inject(MediaService);
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);
  protected readonly ref = inject<DialogRef<string>>(DialogRef);
  protected readonly data = inject<ReportDialogData>(DIALOG_DATA);
  protected readonly titleId = dialogTitleId(this.ref);

  protected readonly checked = signal<Set<string>>(new Set());
  protected readonly rating = signal<Rating | null>(null);
  protected readonly ratings: Rating[] = ['good', 'ok', 'hard'];
  protected readonly note = signal('');
  protected readonly flags = signal<string[]>([]);
  protected readonly nextTime = signal<string[]>([]);
  protected readonly photos = signal<Media[]>([]);
  protected readonly uploading = signal(false);
  protected readonly sending = signal(false);

  protected toggle(id: string, on: boolean): void {
    this.checked.update((set) => {
      const next = new Set(set);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  protected addTo(list: 'flags' | 'nextTime', input: HTMLInputElement): void {
    const value = input.value.trim();
    if (!value) return;
    this[list].update((items) => [...items, value]);
    input.value = '';
    input.focus();
  }

  protected removeFrom(list: 'flags' | 'nextTime', index: number): void {
    this[list].update((items) => items.filter((_, i) => i !== index));
  }

  protected async addPhotos(files: FileList | null): Promise<void> {
    const list = Array.from(files ?? []).slice(0, 20 - this.photos().length);
    if (!list.length) return;
    this.uploading.set(true);
    try {
      for (const file of list) {
        const uploaded = await this.media.upload(this.data.projectId, file, () => undefined);
        this.photos.update((p) => [...p, uploaded]);
      }
    } catch (error) {
      this.showError(error);
    } finally {
      this.uploading.set(false);
    }
  }

  protected async send(event: Event): Promise<void> {
    event.preventDefault();
    this.sending.set(true);
    try {
      const { postId } = await this.api.postVisitReport({
        projectId: this.data.projectId,
        visitId: this.data.visitId,
        done: this.data.template.items.map((i) => ({
          itemId: i.id,
          label: i.label,
          checked: this.checked().has(i.id),
        })),
        rating: this.rating(),
        note: this.note().trim(),
        flags: this.flags(),
        nextTime: this.nextTime(),
        media: this.photos(),
      });
      this.toasts.show(this.translate.instant('report.sent'), 'success');
      this.ref.close(postId);
    } catch (error) {
      this.showError(error);
    } finally {
      this.sending.set(false);
    }
  }

  private showError(error: unknown): void {
    const key = errorMessageKey(error);
    if (key) showSaveError(error, this.saveError, this.toasts, this.translate);
  }
}

import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';

import { LucideCamera, LucideX } from '@lucide/angular';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { POST_TEXT_MAX, QUESTION_MEDIA_MAX, UPDATE_MEDIA_MAX } from '@siteline/shared';

import { errorMessageKey } from '../../core/errors';
import { PhotoTooLargeError } from '../../core/photos';
import { Button } from '../ui/button';
import { Toasts } from '../ui/toast';
import { FeedStore } from './feed-store';

interface Selected {
  file: File;
  preview: string;
}

/**
 * Writes an update (staff) or a question (clients), with photos. Drafts are kept in local
 * storage until posted, so nothing typed is lost (PRD section 13).
 */
@Component({
  selector: 'sl-composer',
  imports: [TranslatePipe, LucideCamera, LucideX, Button],
  templateUrl: './composer.html',
  styleUrl: './composer.css',
})
export class Composer {
  private readonly store = inject(FeedStore);
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);

  readonly mode = input.required<'update' | 'question'>();
  readonly projectId = input.required<string>();
  readonly firmName = input('');

  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('files');
  protected readonly text = signal('');
  protected readonly photos = signal<Selected[]>([]);
  protected readonly sending = signal(false);
  protected readonly maxLength = POST_TEXT_MAX;
  protected readonly maxPhotos = computed(() =>
    this.mode() === 'question' ? QUESTION_MEDIA_MAX : UPDATE_MEDIA_MAX,
  );
  protected readonly canSend = computed(
    () =>
      !this.sending() &&
      (this.text().trim().length > 0 || (this.mode() === 'update' && this.photos().length > 0)),
  );
  private readonly draftKey = computed(() => `sl.draft.${this.projectId()}.${this.mode()}`);

  constructor() {
    effect(() => {
      try {
        this.text.set(localStorage.getItem(this.draftKey()) ?? '');
      } catch {
        // Drafts then last only while the page is open.
      }
    });
  }

  protected onInput(value: string): void {
    this.text.set(value);
    try {
      if (value) localStorage.setItem(this.draftKey(), value);
      else localStorage.removeItem(this.draftKey());
    } catch {
      // See above.
    }
  }

  protected choosePhotos(): void {
    this.fileInput().nativeElement.click();
  }

  protected onFiles(list: FileList | null): void {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith('image/'));
    const room = this.maxPhotos() - this.photos().length;
    if (files.length > room) {
      this.toasts.show(
        this.translate.instant('composer.tooManyPhotos', { max: this.maxPhotos() }),
        'error',
      );
    }
    this.photos.update((list) => [
      ...list,
      ...files
        .slice(0, Math.max(0, room))
        .map((file) => ({ file, preview: URL.createObjectURL(file) })),
    ]);
    this.fileInput().nativeElement.value = '';
  }

  protected removePhoto(index: number): void {
    const photo = this.photos()[index];
    if (photo) URL.revokeObjectURL(photo.preview);
    this.photos.update((list) => list.filter((_, i) => i !== index));
  }

  protected async send(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.canSend()) return;
    const post = {
      type: this.mode(),
      text: this.text().trim(),
      files: this.photos().map((p) => p.file),
    };
    this.sending.set(true);
    // Clear right away: the post now shows in the feed as pending.
    this.photos().forEach((p) => URL.revokeObjectURL(p.preview));
    this.photos.set([]);
    this.onInput('');
    try {
      await this.store.publish(post);
    } catch (error) {
      const key =
        error instanceof PhotoTooLargeError
          ? 'composer.photoTooLarge'
          : (errorMessageKey(error) ?? 'errors.unknown');
      this.toasts.show(this.translate.instant(key), 'error');
      this.onInput(post.text);
    } finally {
      this.sending.set(false);
    }
  }
}

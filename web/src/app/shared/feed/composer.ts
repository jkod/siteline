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

import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { POST_TEXT_MAX, QUESTION_MEDIA_MAX, UPDATE_MEDIA_MAX } from '@siteline/shared';

import { errorMessageKey } from '../../core/errors';
import { Metrics } from '../../core/metrics';
import { PhotoTooLargeError } from '../../core/photos';
import { VoiceService } from '../../core/voice';
import { Button } from '../ui/button';
import { Icon } from '../ui/icon';
import { Toasts } from '../ui/toast';
import { FeedStore } from './feed-store';
import { type Recording, VoiceRecorder } from './voice-recorder';

interface Selected {
  file: File;
  preview: string;
  /** Pipes, wiring, waterproofing or insulation before it's covered (F18). */
  hiddenWork: boolean;
}

/**
 * Writes an update (staff) or a question (clients), with photos. Staff can also talk: the
 * recording comes back as an editable draft (PRD F5). Drafts are kept in local storage until
 * posted, so nothing typed is lost (PRD section 13).
 */
@Component({
  selector: 'sl-composer',
  imports: [Icon, TranslatePipe, Button, VoiceRecorder],
  templateUrl: './composer.html',
  styleUrl: './composer.css',
})
export class Composer {
  private readonly store = inject(FeedStore);
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);
  private readonly voice = inject(VoiceService);
  private readonly metrics = inject(Metrics);

  readonly mode = input.required<'update' | 'question'>();
  readonly projectId = input.required<string>();
  readonly firmName = input('');

  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('files');
  protected readonly text = signal('');
  protected readonly photos = signal<Selected[]>([]);
  protected readonly sending = signal(false);
  /** Waiting for a voice draft. */
  protected readonly drafting = signal(false);
  /** The recording the text came from, until it's posted or thrown away. */
  protected readonly voiceId = signal<string | null>(null);
  protected readonly hasUnsureWords = computed(() => this.text().includes('[?]'));
  protected readonly maxLength = POST_TEXT_MAX;
  protected readonly maxPhotos = computed(() =>
    this.mode() === 'question' ? QUESTION_MEDIA_MAX : UPDATE_MEDIA_MAX,
  );
  protected readonly canSend = computed(
    () =>
      !this.sending() &&
      !this.drafting() &&
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
        .map((file) => ({ file, preview: URL.createObjectURL(file), hiddenWork: false })),
    ]);
    this.fileInput().nativeElement.value = '';
  }

  protected toggleHiddenWork(index: number): void {
    this.photos.update((list) =>
      list.map((p, i) => (i === index ? { ...p, hiddenWork: !p.hiddenWork } : p)),
    );
  }

  protected removePhoto(index: number): void {
    const photo = this.photos()[index];
    if (photo) URL.revokeObjectURL(photo.preview);
    this.photos.update((list) => list.filter((_, i) => i !== index));
  }

  /** Uploads the recording and puts the draft in the text box for editing (PRD F5). */
  protected async onRecorded(recording: Recording): Promise<void> {
    this.drafting.set(true);
    try {
      const result = await this.voice.draft(this.projectId(), recording.audio, recording.format);
      const words = result.draft ?? result.transcript;
      if (!words) {
        this.toasts.show(this.translate.instant('voice.failed'), 'error');
        await this.voice.discard(this.projectId(), result.audioId).catch(() => undefined);
        return;
      }
      if (!result.draft) this.toasts.show(this.translate.instant('voice.transcriptOnly'), 'info');
      const before = this.text().trim();
      this.onInput(before ? `${before}\n\n${words}` : words);
      this.voiceId.set(result.audioId);
    } catch (error) {
      this.toasts.show(this.translate.instant(errorMessageKey(error) ?? 'voice.failed'), 'error');
    } finally {
      this.drafting.set(false);
    }
  }

  /** Throws the voice draft away, and its audio with it. */
  protected async discardVoice(): Promise<void> {
    const audioId = this.voiceId();
    if (!audioId) return;
    this.voiceId.set(null);
    this.onInput('');
    this.metrics.track('voice_draft_discarded', { projectId: this.projectId() });
    await this.voice.discard(this.projectId(), audioId).catch(() => undefined);
  }

  protected async send(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.canSend()) return;
    const post = {
      type: this.mode(),
      text: this.text().trim(),
      files: this.photos().map((p) => p.file),
      hiddenWork: this.photos().some((p) => p.hiddenWork)
        ? this.photos().flatMap((p, i) => (p.hiddenWork ? [i] : []))
        : undefined,
      voiceId: this.voiceId() ?? undefined,
    };
    this.sending.set(true);
    // Clear right away: the post now shows in the feed as pending.
    this.photos().forEach((p) => URL.revokeObjectURL(p.preview));
    this.photos.set([]);
    this.onInput('');
    this.voiceId.set(null);
    try {
      await this.store.publish(post);
      if (post.voiceId) this.metrics.track('voice_draft_used', { projectId: this.projectId() });
    } catch (error) {
      const key =
        error instanceof PhotoTooLargeError
          ? 'composer.photoTooLarge'
          : (errorMessageKey(error) ?? 'errors.unknown');
      this.toasts.show(this.translate.instant(key), 'error');
      this.onInput(post.text);
      this.voiceId.set(post.voiceId ?? null);
    } finally {
      this.sending.set(false);
    }
  }
}

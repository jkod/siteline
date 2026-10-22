import { Component, computed, DestroyRef, inject, input, output, signal } from '@angular/core';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { VOICE_MAX_SECONDS, type VoiceFormat } from '@siteline/shared';

import { recorderFormat } from '../../core/voice';
import { Button } from '../ui/button';
import { Icon } from '../ui/icon';
import { Toasts } from '../ui/toast';

export interface Recording {
  audio: Blob;
  format: VoiceFormat;
  seconds: number;
}

/** A press longer than this is a hold: letting go stops. A shorter tap starts and keeps going. */
const HOLD_MS = 400;
const MIN_SECONDS = 1;

/**
 * "Hold to talk" (PRD F5): hold the button and let go to finish, or tap to start and tap again to
 * stop, which also works from the keyboard. A timer shows, and recording stops at two minutes.
 */
@Component({
  selector: 'sl-voice-recorder',
  imports: [Icon, TranslatePipe, Button],
  host: { class: 'voice' },
  template: `
    <button
      slButton="secondary"
      type="button"
      class="talk"
      [class.recording]="recording()"
      [attr.aria-pressed]="recording()"
      [disabled]="disabled() || !supported"
      (pointerdown)="press($event)"
      (pointerup)="release()"
      (pointercancel)="release()"
      (click)="keyboardToggle($event)"
      (contextmenu)="$event.preventDefault()"
    >
      <sl-icon [name]="recording() ? 'stop_circle' : 'mic'" [size]="20" />
      @if (recording()) {
        {{ 'voice.stop' | translate }}
        <span class="timer">{{ elapsedLabel() }}</span>
      } @else {
        {{ 'voice.hold' | translate }}
      }
    </button>
    <span class="sl-visually-hidden" aria-live="polite">{{ status() | translate }}</span>
  `,
  styles: `
    .talk {
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
    }
    .talk.recording {
      background: var(--sl-alert-tint);
      border-color: var(--sl-alert);
      color: var(--sl-alert-text);
    }
    .timer {
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class VoiceRecorder {
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);

  readonly disabled = input(false);
  readonly recorded = output<Recording>();

  protected readonly supported = recorderFormat() !== null && !!navigator.mediaDevices;
  protected readonly recording = signal(false);
  protected readonly elapsed = signal(0);
  protected readonly status = signal('');
  protected readonly elapsedLabel = computed(
    () => `${clock(this.elapsed())} / ${clock(VOICE_MAX_SECONDS)}`,
  );

  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private pressedAt = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private starting = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.cleanUp());
  }

  protected press(event: PointerEvent): void {
    if (event.button !== 0) return;
    this.pressedAt = Date.now();
    if (this.recording()) this.stop();
    else void this.start();
  }

  protected release(): void {
    if (this.recording() && Date.now() - this.pressedAt >= HOLD_MS) this.stop();
  }

  /** Enter and Space give a click with no pointer: they toggle. */
  protected keyboardToggle(event: MouseEvent): void {
    if (event.detail !== 0) return;
    if (this.recording()) this.stop();
    else void this.start();
  }

  private async start(): Promise<void> {
    const type = recorderFormat();
    if (!type || this.starting) return;
    this.starting = true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      this.starting = false;
      this.toasts.show(this.translate.instant('voice.noMicrophone'), 'error');
      return;
    }
    this.starting = false;
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream, { mimeType: type.mimeType });
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.recorder.onstop = () => this.finish(type.format);
    this.recorder.start(1000);
    this.startedAt = Date.now();
    this.elapsed.set(0);
    this.recording.set(true);
    this.status.set('voice.recording');
    this.timer = setInterval(() => {
      const seconds = Math.floor((Date.now() - this.startedAt) / 1000);
      this.elapsed.set(seconds);
      if (seconds >= VOICE_MAX_SECONDS) this.stop();
    }, 250);
  }

  private stop(): void {
    if (!this.recorder || this.recorder.state === 'inactive') return;
    this.recorder.stop();
  }

  private finish(format: VoiceFormat): void {
    const seconds = Math.min(VOICE_MAX_SECONDS, (Date.now() - this.startedAt) / 1000);
    const audio = new Blob(this.chunks, { type: this.recorder?.mimeType });
    this.cleanUp();
    if (seconds < MIN_SECONDS || audio.size === 0) {
      this.status.set('');
      this.toasts.show(this.translate.instant('voice.tooShort'), 'info');
      return;
    }
    this.status.set('voice.recorded');
    this.recorded.emit({ audio, format, seconds: Math.round(seconds) });
  }

  private cleanUp(): void {
    clearInterval(this.timer);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
    this.recording.set(false);
  }
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { afterNextRender, Component, ElementRef, inject, signal, viewChild } from '@angular/core';

import { LucideChevronLeft, LucideChevronRight, LucideX } from '@lucide/angular';
import { TranslatePipe } from '@ngx-translate/core';
import type { Media } from '@siteline/shared';

import { dialogTitleId } from '../ui/dialog';
import { StorageImage } from '../ui/storage-image';

export interface PhotoViewerData {
  media: Media[];
  index: number;
  alt: string;
}

/**
 * Full-screen photos: swipe between them (scroll snapping), arrow keys or buttons, and the
 * browser's own pinch-zoom. Loads the full-size version only here (PRD section 13).
 */
@Component({
  selector: 'sl-photo-viewer',
  imports: [StorageImage, TranslatePipe, LucideX, LucideChevronLeft, LucideChevronRight],
  host: { '(keydown.arrowleft)': 'go(-1)', '(keydown.arrowright)': 'go(1)' },
  template: `
    <h2 class="sl-visually-hidden" [id]="titleId">{{ 'feed.photos' | translate }}</h2>
    <div class="bar">
      <span class="counter" aria-live="polite">{{ current() + 1 }} / {{ data.media.length }}</span>
      <button
        type="button"
        class="icon"
        [attr.aria-label]="'common.close' | translate"
        (click)="ref.close()"
      >
        <svg lucideX [size]="24"></svg>
      </button>
    </div>
    <div #track class="track" (scroll)="onScroll()">
      @for (item of data.media; track item.path) {
        <div class="slide">
          <sl-storage-image
            [path]="item.path"
            [alt]="data.alt"
            [width]="item.width"
            [height]="item.height"
          />
        </div>
      }
    </div>
    @if (data.media.length > 1) {
      <button
        type="button"
        class="icon nav prev"
        [attr.aria-label]="'feed.previousPhoto' | translate"
        (click)="go(-1)"
      >
        <svg lucideChevronLeft [size]="28"></svg>
      </button>
      <button
        type="button"
        class="icon nav next"
        [attr.aria-label]="'feed.nextPhoto' | translate"
        (click)="go(1)"
      >
        <svg lucideChevronRight [size]="28"></svg>
      </button>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      width: 100vw;
      height: 100dvh;
      background: #0d0f13;
      color: #fff;
    }
    .bar {
      position: absolute;
      inset: 0 0 auto 0;
      z-index: 1;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--sl-space-2) var(--sl-space-3);
    }
    .track {
      display: flex;
      height: 100%;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      scrollbar-width: none;
    }
    .slide {
      flex: 0 0 100%;
      display: grid;
      place-items: center;
      scroll-snap-align: center;
      touch-action: pan-x pinch-zoom;
    }
    sl-storage-image {
      max-width: 100%;
      max-height: 100%;
      background: transparent;
    }
    sl-storage-image ::ng-deep img {
      object-fit: contain;
    }
    .icon {
      display: grid;
      place-items: center;
      width: var(--sl-target);
      height: var(--sl-target);
      border: 0;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.12);
      color: #fff;
      cursor: pointer;
    }
    .nav {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
    }
    .prev {
      left: var(--sl-space-3);
    }
    .next {
      right: var(--sl-space-3);
    }
    @media (hover: none) {
      .nav {
        display: none;
      }
    }
  `,
})
export class PhotoViewer {
  protected readonly data = inject<PhotoViewerData>(DIALOG_DATA);
  protected readonly ref = inject(DialogRef);
  protected readonly titleId = dialogTitleId(this.ref);
  protected readonly current = signal(this.data.index);
  private readonly track = viewChild.required<ElementRef<HTMLElement>>('track');

  constructor() {
    afterNextRender(() => this.scrollTo(this.data.index, 'instant'));
  }

  protected go(step: number): void {
    const next = Math.min(this.data.media.length - 1, Math.max(0, this.current() + step));
    this.scrollTo(next, 'smooth');
  }

  protected onScroll(): void {
    const el = this.track().nativeElement;
    this.current.set(Math.round(el.scrollLeft / el.clientWidth));
  }

  private scrollTo(index: number, behavior: ScrollBehavior): void {
    const el = this.track().nativeElement;
    el.scrollTo({ left: index * el.clientWidth, behavior });
    this.current.set(index);
  }
}

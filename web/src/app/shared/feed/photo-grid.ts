import { Component, computed, inject, input } from '@angular/core';

import { TranslatePipe } from '@ngx-translate/core';
import type { Media } from '@siteline/shared';

import { Dialogs } from '../ui/dialog';
import { StorageImage } from '../ui/storage-image';
import { PhotoViewer, type PhotoViewerData } from './photo-viewer';

/** Up to four thumbnails, with "+N" on the last; each opens the full-screen viewer. */
@Component({
  selector: 'sl-photo-grid',
  imports: [StorageImage, TranslatePipe],
  template: `
    <ul class="grid" [class]="'count-' + Math.min(media().length, 4)">
      @for (item of shown(); track item.path; let i = $index) {
        <li>
          <button
            type="button"
            [attr.aria-label]="'feed.openPhoto' | translate: { n: i + 1, total: media().length }"
            (click)="open(i)"
          >
            <sl-storage-image
              [path]="item.thumbPath"
              [alt]="alt()"
              [width]="item.width"
              [height]="item.height"
            />
            @if (item.tags.includes('hidden_work')) {
              <span class="tag">{{ 'composer.hiddenWork' | translate }}</span>
            }
            @if (i === 3 && media().length > 4) {
              <span class="more" aria-hidden="true">+{{ media().length - 4 }}</span>
            }
          </button>
        </li>
      }
    </ul>
  `,
  styles: `
    .tag {
      position: absolute;
      left: 8px;
      bottom: 8px;
      padding: 2px 8px;
      border-radius: var(--sl-radius-pill);
      background: color-mix(in srgb, var(--sl-dark) 75%, transparent);
      color: #fff;
      font: 600 12px/18px var(--sl-font-body);
    }
    .grid {
      display: grid;
      gap: 4px;
      margin: 0;
      padding: 0;
      list-style: none;
      border-radius: var(--sl-radius-panel);
      overflow: hidden;
    }
    .count-1 {
      grid-template-columns: 1fr;
    }
    .count-2,
    .count-4 {
      grid-template-columns: 1fr 1fr;
    }
    .count-3 {
      grid-template-columns: 2fr 1fr;
      grid-template-rows: 1fr 1fr;
    }
    .count-3 li:first-child {
      grid-row: span 2;
    }
    button {
      position: relative;
      display: block;
      width: 100%;
      height: 100%;
      padding: 0;
      border: 0;
      cursor: zoom-in;
    }
    sl-storage-image {
      width: 100%;
      height: 100%;
      aspect-ratio: 4 / 3;
    }
    .count-1 sl-storage-image {
      aspect-ratio: auto;
      max-height: 420px;
    }
    .more {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      background: rgba(28, 31, 38, 0.55);
      color: #fff;
      font: 800 24px/1 var(--sl-font-display);
    }
  `,
})
export class PhotoGrid {
  private readonly dialogs = inject(Dialogs);

  readonly media = input.required<Media[]>();
  /** The author's caption, or "Photo from {firm}, {date}" (PRD section 13). */
  readonly alt = input.required<string>();
  protected readonly shown = computed(() => this.media().slice(0, 4));
  protected readonly Math = Math;

  protected open(index: number): void {
    this.dialogs.open<void, PhotoViewerData, PhotoViewer>(
      PhotoViewer,
      {
        media: this.media(),
        index,
        alt: this.alt(),
      },
      { fullScreen: true },
    );
  }
}

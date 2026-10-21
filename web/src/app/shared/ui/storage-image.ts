import { Component, effect, inject, input, signal } from '@angular/core';

import { MediaService } from '../../core/media';

/** An image from Cloud Storage, loaded through a download URL once it's allowed. */
@Component({
  selector: 'sl-storage-image',
  template: `
    @if (src(); as url) {
      <img
        [src]="url"
        [alt]="alt()"
        [width]="width()"
        [height]="height()"
        loading="lazy"
        decoding="async"
      />
    } @else {
      <span class="placeholder" role="img" [attr.aria-label]="alt()"></span>
    }
  `,
  styles: `
    :host {
      display: block;
      overflow: hidden;
      background: var(--sl-panel-2);
    }
    img,
    .placeholder {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  `,
})
export class StorageImage {
  private readonly media = inject(MediaService);

  readonly path = input.required<string>();
  /** A local preview (object URL) to show while uploading. */
  readonly preview = input<string | null>(null);
  readonly alt = input.required<string>();
  readonly width = input<number>();
  readonly height = input<number>();

  protected readonly src = signal<string | null>(null);

  constructor() {
    effect((onCleanup) => {
      const preview = this.preview();
      const path = this.path();
      if (preview) {
        this.src.set(preview);
        return;
      }
      let cancelled = false;
      this.src.set(null);
      this.media.url(path).then(
        (url) => !cancelled && this.src.set(url),
        () => undefined,
      );
      onCleanup(() => (cancelled = true));
    });
  }
}

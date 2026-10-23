import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject } from '@angular/core';

import { TranslatePipe } from '@ngx-translate/core';
import type { Media, Post } from '@siteline/shared';

import { liveQuery } from '../../core/live';
import { Button } from '../ui/button';
import { dialogTitleId } from '../ui/dialog';
import { StorageImage } from '../ui/storage-image';

export interface PhotoPickerData {
  projectId: string;
  /** A translation key for the heading, such as "Choose the before photo". */
  titleKey: string;
}

/** Picks one of the project's photos, newest first (the handover's before-and-after pairs). */
@Component({
  selector: 'sl-photo-picker-dialog',
  imports: [TranslatePipe, Button, StorageImage],
  template: `
    <div class="body">
      <h2 [id]="titleId">{{ data.titleKey | translate }}</h2>
      @if (photos().length) {
        <ul class="grid">
          @for (photo of photos(); track photo.path; let i = $index) {
            <li>
              <button
                type="button"
                [attr.aria-label]="'handover.pickPhoto' | translate: { n: i + 1 }"
                (click)="ref.close(photo)"
              >
                <sl-storage-image
                  [path]="photo.thumbPath"
                  alt=""
                  [width]="photo.width"
                  [height]="photo.height"
                />
              </button>
            </li>
          }
        </ul>
      } @else {
        <p>{{ 'handover.noPhotos' | translate }}</p>
      }
      <div class="actions">
        <button slButton="secondary" type="button" (click)="ref.close()">
          {{ 'common.cancel' | translate }}
        </button>
      </div>
    </div>
  `,
  styles: `
    .body {
      display: flex;
      flex-direction: column;
      gap: var(--sl-space-4);
      padding: var(--sl-space-6);
      max-height: 85dvh;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
      gap: var(--sl-space-2);
      margin: 0;
      padding: 0;
      list-style: none;
      overflow-y: auto;
    }
    .grid button {
      display: block;
      width: 100%;
      aspect-ratio: 4 / 3;
      padding: 0;
      border: 0;
      border-radius: var(--sl-radius-panel);
      overflow: hidden;
      cursor: pointer;
    }
    .grid button:focus-visible {
      box-shadow: var(--sl-focus-ring);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
    }
  `,
})
export class PhotoPickerDialog {
  protected readonly ref = inject<DialogRef<Media>>(DialogRef);
  protected readonly data = inject<PhotoPickerData>(DIALOG_DATA);
  protected readonly titleId = dialogTitleId(this.ref);

  private readonly posts = liveQuery<Post>(
    (db, fs) =>
      fs.query(
        fs.collection(db, 'projects', this.data.projectId, 'posts'),
        fs.orderBy('createdAt', 'desc'),
        fs.limit(200),
      ),
    () => this.data.projectId,
  );
  protected readonly photos = computed(() =>
    (this.posts() ?? []).filter((p) => !p.deletedAt).flatMap((p) => p.media ?? []),
  );
}

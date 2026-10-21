import { inject, Injectable } from '@angular/core';

import type { Media } from '@siteline/shared';

import { FirebaseService } from './firebase';
import { preparePhoto } from './photos';

/**
 * Photo upload and download URLs. Uploads go to projects/{id}/media/{mediaId}/, where Storage
 * rules check project membership; URLs are cached for the session.
 */
@Injectable({ providedIn: 'root' })
export class MediaService {
  private readonly firebase = inject(FirebaseService);
  private readonly urls = new Map<string, Promise<string>>();

  url(path: string): Promise<string> {
    let url = this.urls.get(path);
    if (!url) {
      url = Promise.all([this.firebase.storage(), import('firebase/storage')]).then(
        ([storage, s]) => s.getDownloadURL(s.ref(storage, path)),
      );
      url.catch(() => this.urls.delete(path));
      this.urls.set(path, url);
    }
    return url;
  }

  /** Prepares and uploads one photo, reporting progress from 0 to 1. */
  async upload(
    projectId: string,
    file: File,
    onProgress: (fraction: number) => void,
  ): Promise<Media> {
    const photo = await preparePhoto(file);
    const [storage, s] = await Promise.all([this.firebase.storage(), import('firebase/storage')]);
    const mediaId = crypto.randomUUID().replace(/-/g, '');
    const base = `projects/${projectId}/media/${mediaId}`;
    const total = photo.display.size + photo.thumb.size;
    let thumbDone = 0;

    const thumbTask = s.uploadBytesResumable(s.ref(storage, `${base}/thumb.jpg`), photo.thumb, {
      contentType: 'image/jpeg',
    });
    thumbTask.on('state_changed', (snap) => {
      thumbDone = snap.bytesTransferred;
      onProgress(thumbDone / total);
    });
    await thumbTask;
    const displayTask = s.uploadBytesResumable(
      s.ref(storage, `${base}/display.jpg`),
      photo.display,
      {
        contentType: 'image/jpeg',
      },
    );
    displayTask.on('state_changed', (snap) =>
      onProgress((thumbDone + snap.bytesTransferred) / total),
    );
    await displayTask;

    return {
      path: `${base}/display.jpg`,
      thumbPath: `${base}/thumb.jpg`,
      width: photo.width,
      height: photo.height,
      tags: [],
    };
  }
}

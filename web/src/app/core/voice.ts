import { inject, Injectable } from '@angular/core';

import { VOICE_FORMATS, type VoiceFormat } from '@siteline/shared';

import { Api } from './api';
import { FirebaseService } from './firebase';

export interface VoiceResult {
  audioId: string;
  transcript: string | null;
  draft: string | null;
}

/** The recording formats browsers produce, best first: Chrome and Firefox WebM, Safari MP4. */
const CANDIDATES: [string, VoiceFormat][] = [
  ['audio/webm;codecs=opus', 'webm'],
  ['audio/webm', 'webm'],
  ['audio/mp4', 'm4a'],
  ['audio/ogg;codecs=opus', 'ogg'],
];

export function recorderFormat(): { mimeType: string; format: VoiceFormat } | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const [mimeType, format] of CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mimeType)) return { mimeType, format };
  }
  return null;
}

/**
 * Voice-to-update (PRD F5): uploads a recording to the project's staff-only audio folder, then
 * asks draftFromVoice for an editable draft.
 */
@Injectable({ providedIn: 'root' })
export class VoiceService {
  private readonly firebase = inject(FirebaseService);
  private readonly api = inject(Api);

  async draft(projectId: string, audio: Blob, format: VoiceFormat): Promise<VoiceResult> {
    const audioId = crypto.randomUUID().replace(/-/g, '');
    const [storage, s] = await Promise.all([this.firebase.storage(), import('firebase/storage')]);
    await s.uploadBytes(s.ref(storage, `projects/${projectId}/audio/${audioId}.${format}`), audio, {
      contentType: VOICE_FORMATS[format],
    });
    const result = await this.api.draftFromVoice({ projectId, audioId, format });
    return { audioId, ...result };
  }

  discard(projectId: string, audioId: string): Promise<unknown> {
    return this.api.discardVoiceDraft(projectId, audioId);
  }
}

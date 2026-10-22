import type { Locale } from '@siteline/shared';

import type { SpeechAudio, SpeechDraft, SpeechDrafter } from './types';

const DRAFTS: Record<Locale, SpeechDraft> = {
  sv: {
    transcript: 'ja alltså vi har satt upp skåpen idag och bänkskivan kommer på måndag vid nio',
    draft: 'Vi har satt upp skåpen i dag. Bänkskivan kommer på måndag klockan 9.',
  },
  en: {
    transcript: 'so we put up the cabinets today and the worktop comes monday at nine',
    draft: 'We put up the cabinets today. The worktop arrives on Monday at 9.',
  },
};

/**
 * The emulator's drafter: a fixed draft, so the voice flow works without Vertex AI. A recording
 * whose ID contains "fail" fails, to exercise the fallback to an empty composer.
 */
export class DevSpeechDrafter implements SpeechDrafter {
  async draft(audio: SpeechAudio, locale: Locale): Promise<SpeechDraft> {
    if (audio.uri.includes('fail')) throw new Error('Dev drafter failure');
    return DRAFTS[locale];
  }
}

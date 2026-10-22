import type { Locale } from '@siteline/shared';

import type { SpeechAudio, SpeechDraft, SpeechDrafter } from './types';

/** One model call: the audio plus instructions in, a transcript and a draft out. */
export type GenerateDraft = (request: {
  audio: SpeechAudio;
  instructions: string;
}) => Promise<{ transcript: string; draft: string }>;

const LANGUAGE: Record<Locale, string> = { sv: 'Swedish', en: 'English' };

/** Marks a word the model wasn't sure it heard right; the composer highlights these. */
export const UNSURE_MARK = '[?]';

// Emoji and pictographs, which the rewrite must never contain (PRD F5).
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;

export function draftInstructions(locale: Locale): string {
  return [
    `You turn a tradesperson's voice note into a short, friendly update for their client, written in ${LANGUAGE[locale]}.`,
    'Rules:',
    '- Keep numbers, dates, times, measurements, prices and product names exactly as spoken.',
    '- Add nothing that was not said. Do not guess at missing details.',
    '- Use no emoji, no greeting and no sign-off. One to four short sentences.',
    `- Put ${UNSURE_MARK} straight after any word you are unsure you heard correctly.`,
    'Return "transcript", the recording word for word in the language spoken, and "draft", the update.',
  ].join('\n');
}

/**
 * Drafts updates with Gemini on Vertex AI through the EU multi-region endpoint, via Genkit
 * (PRD section 7). Genkit is loaded on first use, so other functions don't pay for it.
 */
export class VertexSpeechDrafter implements SpeechDrafter {
  constructor(private readonly generate: GenerateDraft = genkitGenerate) {}

  async draft(audio: SpeechAudio, locale: Locale): Promise<SpeechDraft> {
    const result = await this.generate({ audio, instructions: draftInstructions(locale) });
    const draft = result.draft.replace(EMOJI, '').replace(/\s+\n/g, '\n').trim();
    return { transcript: result.transcript.trim(), draft: draft || null };
  }
}

const genkitGenerate: GenerateDraft = async ({ audio, instructions }) => {
  const [{ genkit, z }, { vertexAI }] = await Promise.all([
    import('genkit'),
    import('@genkit-ai/google-genai'),
  ]);
  const ai = genkit({ plugins: [vertexAI({ location: 'eu' })] });
  const { output } = await ai.generate({
    model: vertexAI.model('gemini-2.5-flash'),
    prompt: [{ media: { url: audio.uri, contentType: audio.contentType } }, { text: instructions }],
    output: { schema: z.object({ transcript: z.string(), draft: z.string() }) },
    config: { temperature: 0.2 },
  });
  if (!output) throw new Error('The model returned no draft');
  return output;
};

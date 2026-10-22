import { draftInstructions, type GenerateDraft, VertexSpeechDrafter } from './vertex-speech';

const audio = { uri: 'gs://bucket/projects/p1/audio/abc.webm', contentType: 'audio/webm' };

describe('VertexSpeechDrafter', () => {
  it('sends only the audio and instructions in the project language', async () => {
    const generate = vi.fn<GenerateDraft>().mockResolvedValue({ transcript: 't', draft: 'd' });
    await new VertexSpeechDrafter(generate).draft(audio, 'sv');
    const [request] = generate.mock.calls[0]!;
    expect(Object.keys(request).sort()).toEqual(['audio', 'instructions']);
    expect(request.audio).toEqual(audio);
    expect(request.instructions).toContain('written in Swedish');
  });

  it('asks to keep numbers and names exactly, add nothing, use no emoji and mark unsure words', () => {
    const text = draftInstructions('en');
    expect(text).toContain('written in English');
    expect(text).toMatch(/numbers, dates, times, measurements, prices and product names exactly/);
    expect(text).toMatch(/Add nothing that was not said/);
    expect(text).toMatch(/no emoji/);
    expect(text).toContain('[?]');
  });

  it('strips emoji and whitespace, and returns a null draft when the rewrite is empty', async () => {
    const generate = vi
      .fn<GenerateDraft>()
      .mockResolvedValueOnce({ transcript: ' bänken kommer ', draft: 'Bänken kommer 9.00 👍 ' })
      .mockResolvedValueOnce({ transcript: 'hmm', draft: '  ' });
    const drafter = new VertexSpeechDrafter(generate);
    await expect(drafter.draft(audio, 'sv')).resolves.toEqual({
      transcript: 'bänken kommer',
      draft: 'Bänken kommer 9.00',
    });
    await expect(drafter.draft(audio, 'sv')).resolves.toEqual({ transcript: 'hmm', draft: null });
  });

  it('passes model failures on, so the callable can fall back', async () => {
    const generate = vi.fn<GenerateDraft>().mockRejectedValue(new Error('quota'));
    await expect(new VertexSpeechDrafter(generate).draft(audio, 'sv')).rejects.toThrow('quota');
  });
});

import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { provideTestTranslations } from '../../../testing/translate';
import { Metrics } from '../../core/metrics';
import { type VoiceResult, VoiceService } from '../../core/voice';
import { Composer } from './composer';
import { FeedStore, type NewPost } from './feed-store';
import { VoiceRecorder } from './voice-recorder';

describe('Composer', () => {
  const published: NewPost[] = [];
  const tracked: string[] = [];
  const discarded: string[] = [];
  let voiceResult: VoiceResult;

  beforeEach(() => {
    published.length = 0;
    tracked.length = 0;
    discarded.length = 0;
    voiceResult = { audioId: 'rec1', transcript: 'skåpen är uppe', draft: 'Skåpen är uppe.' };
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideTestTranslations(),
        { provide: FeedStore, useValue: { publish: async (p: NewPost) => void published.push(p) } },
        { provide: Metrics, useValue: { track: (name: string) => void tracked.push(name) } },
        {
          provide: VoiceService,
          useValue: {
            draft: async () => voiceResult,
            discard: async (_: string, id: string) => void discarded.push(id),
          },
        },
      ],
    });
  });

  async function render(mode: 'update' | 'question') {
    const fixture = TestBed.createComponent(Composer);
    fixture.componentRef.setInput('mode', mode);
    fixture.componentRef.setInput('projectId', 'p1');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const textarea = el.querySelector('textarea')!;
    const submit = el.querySelector('button[type=submit]') as HTMLButtonElement;
    const type = async (value: string) => {
      textarea.value = value;
      textarea.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };
    return { fixture, el, textarea, submit, type };
  }

  it('can only send once there is text', async () => {
    const { submit, type } = await render('question');
    expect(submit.disabled).toBe(true);
    await type('   ');
    expect(submit.disabled).toBe(true);
    await type('När kommer elektrikern?');
    expect(submit.disabled).toBe(false);
  });

  it('publishes a trimmed question and clears the box', async () => {
    const { fixture, textarea, submit, type } = await render('question');
    await type('  När kommer elektrikern?  ');
    submit.click();
    await fixture.whenStable();
    expect(published).toEqual([{ type: 'question', text: 'När kommer elektrikern?', files: [] }]);
    expect(textarea.value).toBe('');
  });

  it('keeps an unsent draft in local storage per project and mode (PRD section 13)', async () => {
    const first = await render('update');
    await first.type('Halvfärdig uppdatering');
    expect(localStorage.getItem('sl.draft.p1.update')).toBe('Halvfärdig uppdatering');
    first.fixture.destroy();

    const again = await render('update');
    expect(again.textarea.value).toBe('Halvfärdig uppdatering');
    const question = await render('question');
    expect(question.textarea.value).toBe('');
  });

  it('labels the text box for screen readers', async () => {
    const { el, textarea } = await render('update');
    const label = el.querySelector(`label[for="${textarea.id}"]`);
    expect(label?.textContent?.trim()).toBe('composer.updateLabel');
  });

  describe('voice drafts (PRD F5)', () => {
    const recording = { audio: new Blob(['x']), format: 'webm' as const, seconds: 5 };
    async function talk(view: Awaited<ReturnType<typeof render>>) {
      const recorder = view.fixture.debugElement.query(By.directive(VoiceRecorder));
      (recorder.componentInstance as VoiceRecorder).recorded.emit(recording);
      await view.fixture.whenStable();
    }

    it('offers voice for updates only', async () => {
      expect((await render('update')).el.querySelector('sl-voice-recorder')).not.toBeNull();
      expect((await render('question')).el.querySelector('sl-voice-recorder')).toBeNull();
    });

    it('puts the draft in the box for review, and posts it with its recording', async () => {
      const view = await render('update');
      await talk(view);
      expect(view.textarea.value).toBe('Skåpen är uppe.');
      expect(view.el.querySelector('.voice-note')?.textContent).toContain('voice.review');
      view.submit.click();
      await view.fixture.whenStable();
      expect(published[0]).toMatchObject({ text: 'Skåpen är uppe.', voiceId: 'rec1' });
      expect(tracked).toEqual(['voice_draft_used']);
      expect(view.el.querySelector('.voice-note')).toBeNull();
    });

    it('notes words the AI was unsure of', async () => {
      voiceResult = { ...voiceResult, draft: 'Bänken kommer på måndag [?].' };
      const view = await render('update');
      await talk(view);
      expect(view.el.querySelector('.voice-note')?.textContent).toContain('voice.unsure');
    });

    it('falls back to the transcript, or to an empty box, when the AI fails', async () => {
      voiceResult = { audioId: 'rec2', transcript: 'skåpen är uppe', draft: null };
      const view = await render('update');
      await talk(view);
      expect(view.textarea.value).toBe('skåpen är uppe');

      voiceResult = { audioId: 'rec3', transcript: null, draft: null };
      const empty = await render('update');
      localStorage.clear();
      await empty.type('');
      await talk(empty);
      expect(empty.textarea.value).toBe('');
      expect(discarded).toEqual(['rec3']);
      expect(empty.submit.disabled).toBe(true);
    });

    it('throws the draft and its audio away on request', async () => {
      const view = await render('update');
      await talk(view);
      (view.el.querySelector('.voice-note button') as HTMLButtonElement).click();
      await view.fixture.whenStable();
      expect(view.textarea.value).toBe('');
      expect(discarded).toEqual(['rec1']);
      expect(tracked).toEqual(['voice_draft_discarded']);
    });
  });
});

import { TestBed } from '@angular/core/testing';

import { provideTestTranslations } from '../../../testing/translate';
import { Composer } from './composer';
import { FeedStore, type NewPost } from './feed-store';

describe('Composer', () => {
  const published: NewPost[] = [];

  beforeEach(() => {
    published.length = 0;
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideTestTranslations(),
        { provide: FeedStore, useValue: { publish: async (p: NewPost) => void published.push(p) } },
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
});

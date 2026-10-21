import { TestBed } from '@angular/core/testing';

import { provideTestTranslations } from '../../../testing/translate';
import { Toaster, Toasts } from './toast';

describe('Toasts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: provideTestTranslations() });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('closes info toasts by themselves, but keeps errors', () => {
    const toasts = TestBed.inject(Toasts);
    toasts.show('Sparat', 'success');
    toasts.show('Fel', 'error');
    vi.advanceTimersByTime(6000);
    expect(toasts.toasts().map((t) => t.message)).toEqual(['Fel']);
  });

  it('waits while paused and closes after resuming', () => {
    const toasts = TestBed.inject(Toasts);
    const id = toasts.show('Sparat');
    toasts.pause(id);
    vi.advanceTimersByTime(10_000);
    expect(toasts.toasts()).toHaveLength(1);
    toasts.resume(id);
    vi.advanceTimersByTime(6000);
    expect(toasts.toasts()).toHaveLength(0);
  });

  it('announces errors in an alert region and others in a status region', async () => {
    vi.useRealTimers();
    const fixture = TestBed.createComponent(Toaster);
    const toasts = TestBed.inject(Toasts);
    toasts.show('Sparat', 'success');
    toasts.show('Något gick fel', 'error');
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Sparat');
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Något gick fel');
  });
});

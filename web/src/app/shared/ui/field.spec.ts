import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { provideTestTranslations, setTestTranslations } from '../../../testing/translate';
import { Field, type FieldError, Input } from './field';

@Component({
  imports: [Field, Input],
  template: `
    <sl-field label="E-post" [hint]="hint()" [errors]="errors()" [touched]="touched()">
      <input slInput type="email" />
    </sl-field>
  `,
})
class Host {
  readonly hint = signal<string | undefined>('Vi delar den aldrig');
  readonly errors = signal<FieldError[]>([{ kind: 'email' }]);
  readonly touched = signal(false);
}

describe('Field', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestTranslations() });
    setTestTranslations({ errors: { validation: { email: 'Skriv en giltig e-postadress.' } } });
  });

  it('labels the control and describes it with the hint', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    const label: HTMLLabelElement = fixture.nativeElement.querySelector('label');
    expect(label.htmlFor).toBe(input.id);
    const hint = fixture.nativeElement.querySelector('.hint') as HTMLElement;
    expect(input.getAttribute('aria-describedby')).toBe(hint.id);
    expect(input.hasAttribute('aria-invalid')).toBe(false);
  });

  it('shows translated errors only once touched, and marks the control invalid', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.error')).toBeNull();

    fixture.componentInstance.touched.set(true);
    await fixture.whenStable();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    const error = fixture.nativeElement.querySelector('.error') as HTMLElement;
    expect(error.textContent?.trim()).toBe('Skriv en giltig e-postadress.');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')?.split(' ')).toContain(error.id);
  });

  it('clears the error when the errors go away', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.touched.set(true);
    await fixture.whenStable();
    fixture.componentInstance.errors.set([]);
    fixture.componentInstance.hint.set(undefined);
    await fixture.whenStable();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    expect(fixture.nativeElement.querySelector('.error')).toBeNull();
    expect(input.hasAttribute('aria-describedby')).toBe(false);
  });
});

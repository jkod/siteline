import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Button, type ButtonVariant } from './button';

@Component({
  imports: [Button],
  template: `
    <button slButton type="button">Default</button>
    <button [slButton]="variant()" [size]="size()" [busy]="busy()" block type="button">
      Bound
    </button>
  `,
})
class Host {
  readonly variant = signal<ButtonVariant>('secondary');
  readonly size = signal<'default' | 'large'>('large');
  readonly busy = signal(true);
}

describe('Button', () => {
  it('treats a bare slButton attribute as primary', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const [plain] = fixture.nativeElement.querySelectorAll('button');
    expect(plain.classList).toContain('sl-button');
    expect(plain.classList).toContain('sl-button--primary');
  });

  it('applies variant, size, block and busy', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const bound: HTMLButtonElement = fixture.nativeElement.querySelectorAll('button')[1];
    expect(bound.classList).toContain('sl-button--secondary');
    expect(bound.classList).toContain('sl-button--large');
    expect(bound.classList).toContain('sl-button--block');
    expect(bound.getAttribute('aria-busy')).toBe('true');

    fixture.componentInstance.busy.set(false);
    fixture.componentInstance.variant.set('danger');
    await fixture.whenStable();
    expect(bound.hasAttribute('aria-busy')).toBe(false);
    expect(bound.classList).toContain('sl-button--danger');
  });
});

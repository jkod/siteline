import { Component, computed, input } from '@angular/core';

/** Initials in a circle. Decorative: the name is always shown next to it. */
@Component({
  selector: 'sl-avatar',
  template: `{{ initials() }}`,
  host: {
    'aria-hidden': 'true',
    '[class.client]': 'variant() === "client"',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    '[style.font-size.px]': 'size() * 0.4',
  },
  styles: `
    :host {
      display: inline-grid;
      flex: none;
      place-items: center;
      border-radius: 50%;
      background: var(--sl-dark);
      color: #fff;
      font-weight: 700;
      font-family: var(--sl-font-body);
      letter-spacing: 0.02em;
    }
    :host(.client) {
      background: var(--sl-accent-tint);
      color: var(--sl-accent-text);
    }
  `,
})
export class Avatar {
  readonly name = input.required<string>();
  readonly size = input(36);
  readonly variant = input<'staff' | 'client'>('staff');
  protected readonly initials = computed(() =>
    this.name()
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join(''),
  );
}

import { Directive, input } from '@angular/core';

export type CardVariant = 'default' | 'panel' | 'dark';

/** White rounded card, or a panel inside one, on any element (PRD section 12). */
@Directive({
  selector: '[slCard]',
  host: {
    class: 'sl-card',
    '[class.sl-card--panel]': "variant() === 'panel'",
    '[class.sl-card--dark]': "variant() === 'dark'",
  },
})
export class Card {
  /** A bare `slCard` attribute means the default white card. */
  readonly variant = input<CardVariant, CardVariant | ''>('default', {
    alias: 'slCard',
    transform: (value) => value || 'default',
  });
}

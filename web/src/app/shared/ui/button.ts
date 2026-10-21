import { booleanAttribute, Directive, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

/**
 * Pill button on a native `<button>` or `<a>` (PRD section 12). Use `size="large"` for the main
 * action on a screen, and `busy` while it works.
 */
@Directive({
  selector: 'button[slButton], a[slButton]',
  host: {
    class: 'sl-button',
    '[class.sl-button--primary]': "variant() === 'primary'",
    '[class.sl-button--secondary]': "variant() === 'secondary'",
    '[class.sl-button--ghost]': "variant() === 'ghost'",
    '[class.sl-button--danger]': "variant() === 'danger'",
    '[class.sl-button--large]': "size() === 'large'",
    '[class.sl-button--block]': 'block()',
    '[class.sl-button--icon]': 'icon()',
    '[attr.aria-busy]': 'busy() || null',
  },
})
export class Button {
  /** A bare `slButton` attribute means primary. */
  readonly variant = input<ButtonVariant, ButtonVariant | ''>('primary', {
    alias: 'slButton',
    transform: (value) => value || 'primary',
  });
  readonly size = input<'default' | 'large'>('default');
  readonly block = input(false, { transform: booleanAttribute });
  /** Icon-only button; give it an `aria-label`. */
  readonly icon = input(false, { transform: booleanAttribute });
  readonly busy = input(false, { transform: booleanAttribute });
}

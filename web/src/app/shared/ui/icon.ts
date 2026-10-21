import { Component, computed, input } from '@angular/core';

import { ICON_PATHS, type IconName } from './icons.generated';

/**
 * A Material Symbol as inline SVG, in the style set in web/icons.config.json. Decorative by
 * default (hidden from screen readers); give it a `label` when the icon carries meaning on its
 * own. It takes the text colour.
 */
@Component({
  selector: 'sl-icon',
  template: `
    <svg
      viewBox="0 -960 960 960"
      [attr.width]="size()"
      [attr.height]="size()"
      [attr.role]="label() ? 'img' : null"
      [attr.aria-label]="label() || null"
      [attr.aria-hidden]="label() ? null : 'true'"
      focusable="false"
    >
      <path [attr.d]="path()" />
    </svg>
  `,
  host: { class: 'sl-icon' },
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      line-height: 0;
    }
    svg {
      fill: currentColor;
    }
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input(24);
  readonly label = input<string>();
  protected readonly path = computed(() => ICON_PATHS[this.name()]);
}

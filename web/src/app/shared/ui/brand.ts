import { computed, Directive, input } from '@angular/core';

import { accentTextColor, DEFAULT_ACCENT, onAccentColor, tintColor } from '@siteline/shared';

/**
 * Applies a firm's accent colour to everything inside (PRD section 12): the fill colour as is,
 * text on it in white or ink, a light tint, and accent text darkened until it reaches 4.5:1 on
 * that tint (and so on white too).
 */
@Directive({
  selector: '[slBrand]',
  host: {
    '[style.--sl-accent]': 'accent()',
    '[style.--sl-accent-text]': 'accentText()',
    '[style.--sl-on-accent]': 'onAccent()',
    '[style.--sl-accent-tint]': 'tint()',
  },
})
export class Brand {
  readonly color = input<string | null | undefined>(DEFAULT_ACCENT, { alias: 'slBrand' });
  protected readonly accent = computed(() => this.color() || DEFAULT_ACCENT);
  protected readonly tint = computed(() => tintColor(this.accent()));
  protected readonly accentText = computed(() => accentTextColor(this.accent(), 4.5, this.tint()));
  protected readonly onAccent = computed(() => onAccentColor(this.accent()));
}

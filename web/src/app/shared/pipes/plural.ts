import { inject, Pipe, type PipeTransform } from '@angular/core';

import { INTL_LOCALE } from '@siteline/shared';

import { Language } from '../../core/language';

/**
 * Picks the plural form of a translation key with Intl plural rules:
 * `('feed.commentCount' | plural: n) | translate: { count: n }` reads feed.commentCount.one or .other.
 */
@Pipe({ name: 'plural', pure: false })
export class PluralPipe implements PipeTransform {
  private readonly language = inject(Language);

  transform(key: string, count: number): string {
    return `${key}.${new Intl.PluralRules(INTL_LOCALE[this.language.lang()]).select(count)}`;
  }
}

import { inject, Pipe, type PipeTransform } from '@angular/core';

import { formatMoney } from '@siteline/shared';

import { Language } from '../../core/language';

/** Formats öre in the app language: "6 500 kr" or "SEK 6,500". Impure so it follows language changes. */
@Pipe({ name: 'money', pure: false })
export class MoneyPipe implements PipeTransform {
  private readonly language = inject(Language);

  transform(ore: number | null | undefined): string {
    return ore == null ? '' : formatMoney(ore, this.language.lang());
  }
}

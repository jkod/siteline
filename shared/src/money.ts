import { INTL_LOCALE, type Locale } from './constants';

export interface FormatMoneyOptions {
  /**
   * Replace the non-breaking spaces Intl inserts with plain spaces. Text messages need this:
   * non-breaking spaces aren't in GSM-7 and would force the costlier Unicode encoding.
   */
  plain?: boolean;
}

/**
 * Formats an amount in öre: "6 500 kr" in Swedish and "SEK 6,500" in English (PRD F6). Öre
 * are shown only when the amount isn't whole kronor.
 */
export function formatMoney(ore: number, locale: Locale, options: FormatMoneyOptions = {}): string {
  const fractionDigits = ore % 100 === 0 ? 0 : 2;
  const formatted = new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: 'currency',
    currency: 'SEK',
    currencyDisplay: locale === 'sv' ? 'symbol' : 'code',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(ore / 100);
  return options.plain ? formatted.replace(/[\u00a0\u202f]/g, ' ') : formatted;
}

export function kronorToOre(kronor: number): number {
  return Math.round(kronor * 100);
}

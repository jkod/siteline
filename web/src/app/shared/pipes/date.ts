import { inject, Pipe, type PipeTransform } from '@angular/core';

import { INTL_LOCALE, TIME_ZONE, type TimestampLike } from '@siteline/shared';

import { Language } from '../../core/language';

export type DateStyle = 'dateTime' | 'date' | 'time' | 'relative' | 'visit' | 'visitDay';

/**
 * Formats a timestamp in the app language and Stockholm time (PRD section 12): 24-hour times,
 * "3 okt. 2026 18:42", or relative ("för 5 minuter sedan") for recent posts.
 */
export function formatDate(
  value: TimestampLike | Date | null | undefined,
  style: DateStyle,
  lang: 'sv' | 'en',
  nowMs = Date.now(),
): string {
  if (!value) return '';
  const date = value instanceof Date ? value : value.toDate();
  const locale = INTL_LOCALE[lang];
  if (style === 'relative') {
    const seconds = Math.round((date.getTime() - nowMs) / 1000);
    const abs = Math.abs(seconds);
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    if (abs < 60) return rtf.format(0, 'second');
    if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
    if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), 'hour');
    if (abs < 7 * 86_400) return rtf.format(Math.round(seconds / 86_400), 'day');
    style = 'dateTime';
  }
  if (style === 'visit' || style === 'visitDay') {
    // "tis 4 nov. 15:00": weekday first, for visits.
    const day = new Intl.DateTimeFormat(locale, {
      timeZone: TIME_ZONE,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(date);
    if (style === 'visitDay') return day;
    const time = new Intl.DateTimeFormat(locale, {
      timeZone: TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(date);
    return `${day} ${time}`;
  }
  const options: Intl.DateTimeFormatOptions = { timeZone: TIME_ZONE, hourCycle: 'h23' };
  if (style !== 'time') Object.assign(options, { day: 'numeric', month: 'short', year: 'numeric' });
  if (style !== 'date') Object.assign(options, { hour: '2-digit', minute: '2-digit' });
  return new Intl.DateTimeFormat(locale, options).format(date);
}

@Pipe({ name: 'slDate', pure: false })
export class DatePipe implements PipeTransform {
  private readonly language = inject(Language);

  transform(value: TimestampLike | Date | null | undefined, style: DateStyle = 'dateTime'): string {
    return formatDate(value, style, this.language.lang());
  }
}

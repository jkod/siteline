import { INTL_LOCALE, type Locale, TIME_ZONE } from '@siteline/shared';

/** "tis 4 nov. kl. 15:00" / "Tue 4 Nov at 15:00", in Stockholm time, for messages. */
export function visitWhen(date: Date, locale: Locale): string {
  const day = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone: TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date);
  return `${day} ${locale === 'sv' ? 'kl.' : 'at'} ${timeOf(date)}`;
}

export function timeOf(date: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

export function dayOf(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone: TIME_ZONE,
    day: 'numeric',
    month: 'short',
  }).format(date);
}

/** "3 uppdateringar och 8 foton" / "1 update and 1 photo". */
export function digestSummary(updates: number, photos: number, locale: Locale): string {
  const words =
    locale === 'sv'
      ? { update: ['uppdatering', 'uppdateringar'], photo: ['foto', 'foton'], and: 'och' }
      : { update: ['update', 'updates'], photo: ['photo', 'photos'], and: 'and' };
  const part = (n: number, [one, many]: string[]) => `${n} ${n === 1 ? one : many}`;
  return photos > 0
    ? `${part(updates, words.update)} ${words.and} ${part(photos, words.photo)}`
    : part(updates, words.update);
}

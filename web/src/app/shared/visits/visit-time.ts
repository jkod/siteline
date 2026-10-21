import { stockholmDate, type TimestampLike, zonedParts, zonedTimeToUtc } from '@siteline/shared';

/** A Stockholm date (YYYY-MM-DD) and time (HH:MM) to the instant, across daylight saving. */
export function toInstant(date: string, time: string): Date {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const [hour, minute] = time.split(':').map(Number) as [number, number];
  return zonedTimeToUtc({ year, month, day, hour, minute });
}

/** An instant as a Stockholm date and time, for form fields. */
export function fromInstant(value: TimestampLike | Date): { date: string; time: string } {
  const d = value instanceof Date ? value : value.toDate();
  const p = zonedParts(d);
  return {
    date: stockholmDate(d),
    time: `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`,
  };
}

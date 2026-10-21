import { QUIET_HOURS, TIME_ZONE } from './constants';

/** The wall-clock parts of an instant in a time zone. */
export function zonedParts(date: Date, timeZone = TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** The UTC instant of a wall-clock time in a time zone, correct across daylight saving changes. */
export function zonedTimeToUtc(
  wall: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone = TIME_ZONE,
): Date {
  const guess = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  // The zone's offset at the guess, applied twice to settle across a DST change.
  let result = guess;
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(result), timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    result = guess - (asUtc - result);
  }
  return new Date(result);
}

/**
 * When a text or push to a client may go out: right away, or 07:00 Stockholm time when `now`
 * falls in the quiet hours from 21:00 (PRD section 6).
 */
export function clientSendTime(now: Date): Date {
  const local = zonedParts(now);
  if (local.hour >= QUIET_HOURS.end && local.hour < QUIET_HOURS.start) return now;
  const day = new Date(Date.UTC(local.year, local.month - 1, local.day));
  if (local.hour >= QUIET_HOURS.start) day.setUTCDate(day.getUTCDate() + 1);
  return zonedTimeToUtc({
    year: day.getUTCFullYear(),
    month: day.getUTCMonth() + 1,
    day: day.getUTCDate(),
    hour: QUIET_HOURS.end,
    minute: 0,
  });
}

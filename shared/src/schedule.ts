import type { Weekday } from 'rrule';
import * as rruleModule from 'rrule';

import type { Schedule } from './model';
import { zonedParts, zonedTimeToUtc } from './time';

// Recurring visits (PRD F19). rrule works in UTC, so a schedule stores Stockholm wall-clock
// times as if they were UTC ("floating"). Each occurrence is converted to the real instant, so
// a 15:00 lesson stays at 15:00 across daylight saving changes.

// Bundlers load rrule's ES module; plain Node (the seed script) its CommonJS build, where the
// exports sit on the default export.
const { RRule } =
  (Reflect.get(rruleModule, 'default') as typeof rruleModule | undefined) ?? rruleModule;

export type Weekday3 = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

const WEEKDAYS: Record<Weekday3, Weekday> = {
  MO: RRule.MO,
  TU: RRule.TU,
  WE: RRule.WE,
  TH: RRule.TH,
  FR: RRule.FR,
  SA: RRule.SA,
  SU: RRule.SU,
};

export interface ScheduleInput {
  /** Every week, or every other week. */
  interval: 1 | 2;
  weekdays: Weekday3[];
  /** First possible date, YYYY-MM-DD. */
  startDate: string;
  /** Start time, HH:MM in Stockholm. */
  time: string;
  durationMinutes: number;
  skipDates?: string[];
}

export function buildSchedule(input: ScheduleInput): Schedule {
  const [year, month, day] = input.startDate.split('-').map(Number) as [number, number, number];
  const [hour, minute] = input.time.split(':').map(Number) as [number, number];
  const rule = new RRule({
    freq: RRule.WEEKLY,
    interval: input.interval,
    byweekday: input.weekdays.map((d) => WEEKDAYS[d]),
    dtstart: new Date(Date.UTC(year, month - 1, day, hour, minute)),
  });
  return {
    rrule: rule.toString(),
    durationMinutes: input.durationMinutes,
    skipDates: input.skipDates ?? [],
  };
}

export interface Occurrence {
  /** The calendar date in Stockholm, YYYY-MM-DD; also the visit's ID suffix. */
  date: string;
  startAt: Date;
  endAt: Date;
}

/** The schedule's visits between two instants, minus skipped dates. */
export function occurrences(schedule: Schedule, from: Date, to: Date): Occurrence[] {
  const rule = RRule.fromString(schedule.rrule);
  // Search in floating time, padded a day either side for the zone offset.
  const floatingFrom = new Date(from.getTime() - 86_400_000);
  const floatingTo = new Date(to.getTime() + 86_400_000);
  return rule
    .between(floatingFrom, floatingTo, true)
    .map((floating) => {
      const startAt = zonedTimeToUtc({
        year: floating.getUTCFullYear(),
        month: floating.getUTCMonth() + 1,
        day: floating.getUTCDate(),
        hour: floating.getUTCHours(),
        minute: floating.getUTCMinutes(),
      });
      return {
        date: floating.toISOString().slice(0, 10),
        startAt,
        endAt: new Date(startAt.getTime() + schedule.durationMinutes * 60_000),
      };
    })
    .filter((o) => o.startAt >= from && o.startAt <= to && !schedule.skipDates.includes(o.date));
}

/** Readable parts of a schedule, for the UI: interval, weekdays and the HH:MM start time. */
export function describeSchedule(schedule: Schedule): {
  interval: number;
  weekdays: Weekday3[];
  time: string;
} {
  const options = RRule.fromString(schedule.rrule).origOptions;
  const days = ([] as (Weekday | number | string)[]).concat(options.byweekday ?? []);
  const names = Object.keys(WEEKDAYS) as Weekday3[];
  const start = options.dtstart ?? new Date(0);
  return {
    interval: options.interval ?? 1,
    weekdays: days.map((d) => names[typeof d === 'number' ? d : (d as Weekday).weekday]!),
    time: `${String(start.getUTCHours()).padStart(2, '0')}:${String(start.getUTCMinutes()).padStart(2, '0')}`,
  };
}

/** The Stockholm calendar date of an instant, YYYY-MM-DD. */
export function stockholmDate(date: Date): string {
  const p = zonedParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** The UTC range of a Stockholm calendar day. */
export function stockholmDayRange(date: string): { start: Date; end: Date } {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return {
    start: zonedTimeToUtc({ year, month, day, hour: 0, minute: 0 }),
    end: zonedTimeToUtc({
      year: next.getUTCFullYear(),
      month: next.getUTCMonth() + 1,
      day: next.getUTCDate(),
      hour: 0,
      minute: 0,
    }),
  };
}

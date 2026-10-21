import {
  buildSchedule,
  describeSchedule,
  occurrences,
  stockholmDate,
  stockholmDayRange,
} from './schedule';

const at = (iso: string) => new Date(iso);

describe('schedules', () => {
  const weekly = buildSchedule({
    interval: 1,
    weekdays: ['TU'],
    startDate: '2026-10-20',
    time: '15:00',
    durationMinutes: 60,
  });

  it('creates weekly visits at the same Stockholm time across daylight saving', () => {
    const visits = occurrences(weekly, at('2026-10-19T00:00:00Z'), at('2026-11-04T00:00:00Z'));
    expect(visits.map((v) => v.date)).toEqual(['2026-10-20', '2026-10-27', '2026-11-03']);
    // 15:00 CEST is 13:00 UTC; after 25 October, 15:00 CET is 14:00 UTC.
    expect(visits.map((v) => v.startAt.toISOString())).toEqual([
      '2026-10-20T13:00:00.000Z',
      '2026-10-27T14:00:00.000Z',
      '2026-11-03T14:00:00.000Z',
    ]);
    expect(visits[0]!.endAt.toISOString()).toBe('2026-10-20T14:00:00.000Z');
  });

  it('supports every other week on several days', () => {
    const s = buildSchedule({
      interval: 2,
      weekdays: ['MO', 'TH'],
      startDate: '2026-11-02',
      time: '08:30',
      durationMinutes: 90,
    });
    const dates = occurrences(s, at('2026-11-01T00:00:00Z'), at('2026-11-30T00:00:00Z')).map(
      (v) => v.date,
    );
    expect(dates).toEqual(
      ['2026-11-02', '2026-11-05', '2026-11-16', '2026-11-19', '2026-11-30'].filter(
        (d) => d < '2026-11-30',
      ),
    );
  });

  it('produces no visit on a skipped date (PRD F19)', () => {
    const s = { ...weekly, skipDates: ['2026-10-27'] };
    const dates = occurrences(s, at('2026-10-19T00:00:00Z'), at('2026-11-04T00:00:00Z')).map(
      (v) => v.date,
    );
    expect(dates).toEqual(['2026-10-20', '2026-11-03']);
  });

  it('describes a schedule for the UI', () => {
    const s = buildSchedule({
      interval: 2,
      weekdays: ['TH'],
      startDate: '2026-10-22',
      time: '09:15',
      durationMinutes: 45,
    });
    expect(describeSchedule(s)).toEqual({ interval: 2, weekdays: ['TH'], time: '09:15' });
  });

  it('works with Stockholm calendar days', () => {
    expect(stockholmDate(at('2026-10-21T22:30:00Z'))).toBe('2026-10-22');
    const day = stockholmDayRange('2026-10-25');
    expect(day.start.toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(day.end.toISOString()).toBe('2026-10-25T23:00:00.000Z');
  });
});

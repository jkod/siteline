import { fromInstant, toInstant } from './visit-time';

describe('visit times', () => {
  it('converts Stockholm wall time to instants and back, in summer and winter', () => {
    expect(toInstant('2026-07-01', '07:30').toISOString()).toBe('2026-07-01T05:30:00.000Z');
    expect(toInstant('2026-12-01', '07:30').toISOString()).toBe('2026-12-01T06:30:00.000Z');
    expect(fromInstant(new Date('2026-12-01T06:30:00Z'))).toEqual({
      date: '2026-12-01',
      time: '07:30',
    });
  });
});

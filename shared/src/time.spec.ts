import { clientSendTime, zonedTimeToUtc } from './time';

const at = (iso: string) => new Date(iso);

describe('clientSendTime', () => {
  it('sends straight away during the day', () => {
    const now = at('2026-10-21T12:00:00Z'); // 14:00 in Stockholm (CEST)
    expect(clientSendTime(now)).toEqual(now);
  });

  it('holds a message sent at 21:30 until 07:00 the next morning', () => {
    expect(clientSendTime(at('2026-10-21T19:30:00Z'))).toEqual(at('2026-10-22T05:00:00Z'));
  });

  it('holds a message sent at 03:00 until 07:00 the same morning', () => {
    expect(clientSendTime(at('2026-10-22T01:00:00Z'))).toEqual(at('2026-10-22T05:00:00Z'));
  });

  it('treats 21:00 as quiet and 07:00 as allowed', () => {
    expect(clientSendTime(at('2026-10-21T19:00:00Z'))).toEqual(at('2026-10-22T05:00:00Z'));
    expect(clientSendTime(at('2026-10-22T05:00:00Z'))).toEqual(at('2026-10-22T05:00:00Z'));
  });

  it('handles the night daylight saving time ends', () => {
    // 22:00 on 24 Oct 2026 (CEST); clocks go back at 03:00 on 25 Oct, so 07:00 is CET.
    expect(clientSendTime(at('2026-10-24T20:00:00Z'))).toEqual(at('2026-10-25T06:00:00Z'));
  });
});

describe('zonedTimeToUtc', () => {
  it('converts winter and summer wall times', () => {
    expect(zonedTimeToUtc({ year: 2026, month: 1, day: 15, hour: 7, minute: 0 })).toEqual(
      at('2026-01-15T06:00:00Z'),
    );
    expect(zonedTimeToUtc({ year: 2026, month: 7, day: 15, hour: 7, minute: 0 })).toEqual(
      at('2026-07-15T05:00:00Z'),
    );
  });
});

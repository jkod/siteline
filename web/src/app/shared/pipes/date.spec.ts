import { formatDate } from './date';

const at = (iso: string) => new Date(iso);

describe('formatDate', () => {
  it('shows 24-hour Stockholm times in Swedish and English', () => {
    const d = at('2026-10-03T16:42:00Z');
    expect(formatDate(d, 'dateTime', 'sv')).toMatch(/3 okt\.? 2026,? 18:42/);
    expect(formatDate(d, 'dateTime', 'en')).toMatch(/3 Oct 2026,? 18:42/);
    expect(formatDate(d, 'time', 'sv')).toBe('18:42');
  });

  it('shows recent times relatively and older ones as dates', () => {
    const now = at('2026-10-21T12:00:00Z').getTime();
    expect(formatDate(at('2026-10-21T11:55:00Z'), 'relative', 'sv', now)).toBe(
      'för 5 minuter sedan',
    );
    expect(formatDate(at('2026-10-21T11:55:00Z'), 'relative', 'en', now)).toBe('5 minutes ago');
    expect(formatDate(at('2026-10-01T12:00:00Z'), 'relative', 'en', now)).toMatch(/1 Oct 2026/);
  });

  it('is empty for missing values', () => {
    expect(formatDate(null, 'date', 'sv')).toBe('');
  });
});

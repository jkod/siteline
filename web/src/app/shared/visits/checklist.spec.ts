import { mayToggle } from './checklist';

const at = (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) });

describe('mayToggle', () => {
  const now = 1_000_000_000_000;

  it('lets clients tick only client items, and staff any item', () => {
    expect(mayToggle({ side: 'client', doneAt: null }, 'client', now)).toBe(true);
    expect(mayToggle({ side: 'firm', doneAt: null }, 'client', now)).toBe(false);
    expect(mayToggle({ side: 'firm', doneAt: null }, 'staff', now)).toBe(true);
  });

  it('allows unticking within 24 hours only (PRD F7)', () => {
    expect(mayToggle({ side: 'client', doneAt: at(now - 23 * 3600_000) }, 'client', now)).toBe(
      true,
    );
    expect(mayToggle({ side: 'client', doneAt: at(now - 25 * 3600_000) }, 'client', now)).toBe(
      false,
    );
    expect(mayToggle({ side: 'firm', doneAt: at(now - 25 * 3600_000) }, 'staff', now)).toBe(false);
  });
});

import { agreedPrice, approvedExtraWorkTotal, decisionHasPrice, decisionsCsv } from './decisions';

describe('approvedExtraWorkTotal', () => {
  it('sums only approved extra-work versions (PRD F6)', () => {
    expect(
      approvedExtraWorkTotal([
        { kind: 'extra_work', status: 'approved', priceOre: 650_000 },
        { kind: 'extra_work', status: 'superseded', priceOre: 600_000 },
        { kind: 'extra_work', status: 'declined', priceOre: 120_000 },
        { kind: 'extra_work', status: 'sent', priceOre: 90_000 },
        { kind: 'choice', status: 'approved', priceOre: 50_000 },
        { kind: 'extra_work', status: 'approved', priceOre: 45_000 },
      ]),
    ).toBe(695_000);
  });
});

describe('decision prices', () => {
  it('knows when a card involves money', () => {
    expect(decisionHasPrice({ kind: 'extra_work', priceOre: 650_000 })).toBe(true);
    expect(decisionHasPrice({ kind: 'approval' })).toBe(false);
    expect(
      decisionHasPrice({
        kind: 'choice',
        options: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B', priceDeltaOre: 20_000 },
        ],
      }),
    ).toBe(true);
    expect(decisionHasPrice({ kind: 'choice', options: [{ id: 'a', label: 'A' }] })).toBe(false);
  });

  it('gives the agreed price per kind', () => {
    expect(agreedPrice({ kind: 'extra_work', priceOre: 650_000 }, null)).toBe(650_000);
    expect(
      agreedPrice(
        { kind: 'choice', options: [{ id: 'b', label: 'B', priceDeltaOre: 20_000 }] },
        'b',
      ),
    ).toBe(20_000);
    expect(agreedPrice({ kind: 'approval' }, null)).toBeNull();
  });
});

describe('decisionsCsv', () => {
  it('writes a semicolon CSV with a BOM and quotes where needed', () => {
    const csv = decisionsCsv([
      {
        title: 'Byt golvbjälke; kök',
        kind: 'extra_work',
        status: 'approved',
        version: 1,
        priceOre: 650_000,
        sentAt: new Date('2026-10-03T16:00:00Z'),
        decidedAt: new Date('2026-10-03T16:42:00Z'),
        decidedBy: 'Anna Lindqvist',
        choice: '',
        reason: '',
      },
    ]);
    expect(csv.startsWith('﻿Rubrik;Typ;Status')).toBe(true);
    expect(csv).toContain(
      '"Byt golvbjälke; kök";extra_work;approved;1;6 500 kr;2026-10-03T16:00:00.000Z',
    );
  });
});

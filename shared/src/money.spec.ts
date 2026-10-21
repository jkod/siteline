import { formatMoney, kronorToOre } from './money';

const spaces = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');

describe('formatMoney', () => {
  it('formats Swedish as "6 500 kr"', () => {
    expect(spaces(formatMoney(650_000, 'sv'))).toBe('6 500 kr');
  });

  it('formats English as "SEK 6,500"', () => {
    expect(spaces(formatMoney(650_000, 'en'))).toBe('SEK 6,500');
  });

  it('shows öre only when the amount is not whole kronor', () => {
    expect(spaces(formatMoney(650_050, 'sv'))).toBe('6 500,50 kr');
  });

  it('uses only plain spaces in plain mode, for GSM-7 text messages', () => {
    expect(formatMoney(650_000, 'sv', { plain: true })).toBe('6 500 kr');
  });
});

describe('kronorToOre', () => {
  it('rounds to whole öre', () => {
    expect(kronorToOre(19.999)).toBe(2000);
  });
});

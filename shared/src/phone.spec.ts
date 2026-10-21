import { maskPhone, normalizePhone } from './phone';
import { phoneSchema } from './schemas';

describe('normalizePhone', () => {
  it.each([
    ['070-174 06 05', '+46701740605'],
    ['0701740605', '+46701740605'],
    ['+46 70 174 06 05', '+46701740605'],
    ['0046701740605', '+46701740605'],
    ['(070) 174.06.05', '+46701740605'],
    ['+4791234567', '+4791234567'],
  ])('normalises %s to %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['', 'abc', '123', '+0701740605', '+4670174060512345678'])('rejects %s', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  it('uses another default country code when given', () => {
    expect(normalizePhone('91234567', '+47')).toBe('+4791234567');
  });
});

describe('maskPhone', () => {
  it('keeps only the country code, the first two digits and the last two', () => {
    expect(maskPhone('+46701740605')).toBe('+46 70 *** ** 05');
  });
});

describe('phoneSchema', () => {
  it('parses to E.164', () => {
    expect(phoneSchema.parse('070-174 06 05')).toBe('+46701740605');
  });

  it('fails on an invalid number', () => {
    expect(phoneSchema.safeParse('12').success).toBe(false);
  });
});

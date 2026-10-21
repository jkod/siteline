import { formatOrgNumber, isValidOrgNumber } from './org-number';

describe('isValidOrgNumber', () => {
  it.each(['556016-0680', '5560160680', '16556016-0680', '556016 0680'])('accepts %s', (input) => {
    expect(isValidOrgNumber(input)).toBe(true);
  });

  it.each(['556016-0681', '55601606', 'abcdef-ghij', '', '1234567890123'])(
    'rejects %s',
    (input) => {
      expect(isValidOrgNumber(input)).toBe(false);
    },
  );
});

describe('formatOrgNumber', () => {
  it('formats with a hyphen and drops the century prefix', () => {
    expect(formatOrgNumber('165560160680')).toBe('556016-0680');
  });
});

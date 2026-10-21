import { DEFAULT_COUNTRY_CODE } from './constants';

const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * Normalises a phone number as typed by a person to E.164. Numbers without a country code get
 * `defaultCountryCode`, and a leading trunk zero is dropped ("070-174 06 05" → "+46701740605").
 * Returns `null` when the result isn't a plausible E.164 number.
 */
export function normalizePhone(
  input: string,
  defaultCountryCode = DEFAULT_COUNTRY_CODE,
): string | null {
  let digits = input.trim().replace(/[\s\-().]/g, '');
  if (digits.startsWith('00')) {
    digits = `+${digits.slice(2)}`;
  } else if (!digits.startsWith('+')) {
    digits = `${defaultCountryCode}${digits.replace(/^0/, '')}`;
  }
  return E164.test(digits) ? digits : null;
}

/** Masks an E.164 number for display and evidence records: "+46701740605" → "+46 70 *** ** 05". */
export function maskPhone(e164: string): string {
  const visibleStart = e164.slice(0, 5);
  const visibleEnd = e164.slice(-2);
  return `${visibleStart.slice(0, 3)} ${visibleStart.slice(3)} *** ** ${visibleEnd}`;
}

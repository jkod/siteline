function luhnValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let n = Number(digits[i]);
    if (i % 2 === 0) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

/**
 * Checks a Swedish organisationsnummer: ten digits (or twelve with a century prefix), an
 * optional hyphen, and a Luhn check digit. Sole traders use their personnummer, which has the
 * same format, so it passes too.
 */
export function isValidOrgNumber(input: string): boolean {
  const compact = input.replace(/[\s-]/g, '');
  if (!/^\d{10}(\d{2})?$/.test(compact)) return false;
  const tenDigits = compact.length === 12 ? compact.slice(2) : compact;
  return luhnValid(tenDigits);
}

/** Formats an organisation number as "NNNNNN-NNNN". */
export function formatOrgNumber(input: string): string {
  const compact = input.replace(/[\s-]/g, '');
  const tenDigits = compact.length === 12 ? compact.slice(2) : compact;
  return `${tenDigits.slice(0, 6)}-${tenDigits.slice(6)}`;
}

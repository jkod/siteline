// The GSM-7 basic set plus its extension table. Å, Ä, Ö, å, ä and ö are in it; emoji, en dashes
// and non-breaking spaces are not, and force the costlier Unicode encoding (PRD section 6).
const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXTENDED = '^{}\\[~]|€\f';

export const SMS_SINGLE_LENGTH = 160;

export function isGsm7(text: string): boolean {
  for (const char of text) {
    if (!GSM7_BASIC.includes(char) && !GSM7_EXTENDED.includes(char)) return false;
  }
  return true;
}

/** Length in GSM-7 septets; extension characters count twice. */
export function gsm7Length(text: string): number {
  let length = 0;
  for (const char of text) length += GSM7_EXTENDED.includes(char) ? 2 : 1;
  return length;
}

/** Replaces common characters outside GSM-7 with close equivalents. */
export function toGsm7(text: string): string {
  return text
    .replace(/[\u00a0\u202f\u2009]/g, ' ')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, '...');
}

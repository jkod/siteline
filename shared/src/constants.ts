export const APP_NAME = 'Siteline';
export const REGION = 'europe-north1';
export const TIME_ZONE = 'Europe/Stockholm';
export const DEFAULT_COUNTRY_CODE = '+46';
export const DEFAULT_ACCENT = '#127A69';
export const VAT_RATE = 0.25;

export const LOCALES = ['sv', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'sv';

/** Intl locales per app language. English uses en-GB for 24-hour times and "SEK 6,500". */
export const INTL_LOCALE: Record<Locale, string> = { sv: 'sv-SE', en: 'en-GB' };

/** Client text messages are held back between these hours, Stockholm time (PRD section 6). */
export const QUIET_HOURS = { start: 21, end: 7 } as const;

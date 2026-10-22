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

/** Voice-to-update limits (PRD F5 and section 10). */
export const VOICE_MAX_SECONDS = 120;
export const VOICE_MAX_BYTES = 5 * 1024 * 1024;
export const VOICE_DAILY_LIMIT = 100;
/** Audio is kept this long after its post is published, and a day if it's never used. */
export const VOICE_RETENTION_DAYS = 30;
export const VOICE_FORMATS = { webm: 'audio/webm', m4a: 'audio/mp4', ogg: 'audio/ogg' } as const;
export type VoiceFormat = keyof typeof VOICE_FORMATS;

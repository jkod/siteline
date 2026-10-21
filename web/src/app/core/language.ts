import { DOCUMENT, inject, Injectable, signal } from '@angular/core';

import { firstValueFrom } from 'rxjs';

import { TranslateService } from '@ngx-translate/core';
import { DEFAULT_LOCALE, type Locale, LOCALES } from '@siteline/shared';

const STORAGE_KEY = 'sl.lang';

/** The app language: Swedish by default, English second (PRD section 13). */
@Injectable({ providedIn: 'root' })
export class Language {
  private readonly translate = inject(TranslateService);
  private readonly document = inject(DOCUMENT);

  private readonly current = signal<Locale>(DEFAULT_LOCALE);
  readonly lang = this.current.asReadonly();
  readonly available = LOCALES;

  /** Loads the stored language before the first render, so no keys flash on screen. */
  init(): Promise<unknown> {
    return this.use(this.stored() ?? DEFAULT_LOCALE);
  }

  async use(lang: Locale): Promise<void> {
    await firstValueFrom(this.translate.use(lang));
    this.current.set(lang);
    this.document.documentElement.lang = lang;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // The choice then lasts only for this visit.
    }
  }

  private stored(): Locale | null {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return LOCALES.find((l) => l === value) ?? null;
    } catch {
      return null;
    }
  }
}

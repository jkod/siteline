import { TestBed } from '@angular/core/testing';

import {
  provideTranslateService,
  TranslateService,
  type TranslationObject,
} from '@ngx-translate/core';

/** Translation providers for component tests; keys render as themselves unless set. */
export function provideTestTranslations() {
  return provideTranslateService({ lang: 'sv', fallbackLang: 'sv' });
}

export function setTestTranslations(translations: TranslationObject): void {
  const translate = TestBed.inject(TranslateService);
  translate.setTranslation('sv', translations);
  translate.use('sv');
}

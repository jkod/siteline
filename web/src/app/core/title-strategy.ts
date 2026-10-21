import { DestroyRef, inject, Injectable } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { type RouterStateSnapshot, TitleStrategy } from '@angular/router';

import { TranslateService } from '@ngx-translate/core';
import { APP_NAME } from '@siteline/shared';

/** Route titles are translation keys; the page title follows the language (WCAG 2.4.2). */
@Injectable()
export class TranslatedTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly translate = inject(TranslateService);
  private lastKey: string | undefined;

  constructor() {
    super();
    const subscription = this.translate.onLangChange.subscribe(() => this.apply());
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.lastKey = this.buildTitle(snapshot);
    this.apply();
  }

  private apply(): void {
    this.title.setTitle(
      this.lastKey ? `${this.translate.instant(this.lastKey)} · ${APP_NAME}` : APP_NAME,
    );
  }
}

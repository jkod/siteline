import { Component, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { TranslatePipe } from '@ngx-translate/core';

import { Language } from './core/language';
import { Session } from './core/session';
import { OfflineBanner } from './shared/ui/offline-banner';
import { Toaster } from './shared/ui/toast';

@Component({
  selector: 'sl-root',
  imports: [RouterOutlet, Toaster, OfflineBanner, TranslatePipe],
  template: `
    <a class="sl-skip-link" href="#main">{{ 'common.skipToContent' | translate }}</a>
    <sl-offline-banner />
    <router-outlet />
    <sl-toaster />
  `,
})
export class App {
  constructor() {
    // A signed-in person's language follows their profile (PRD section 13).
    const session = inject(Session);
    const language = inject(Language);
    effect(() => {
      const locale = session.profile()?.locale;
      if (locale && locale !== language.lang()) void language.use(locale);
    });
  }
}

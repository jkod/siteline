import { Component, input } from '@angular/core';
import type { Route } from '@angular/router';

import { TranslatePipe } from '@ngx-translate/core';

import { Card } from './card';

/** Stands in for a screen that a later milestone builds. `titleKey` comes from route data. */
@Component({
  selector: 'sl-placeholder-page',
  imports: [TranslatePipe, Card],
  template: `
    <main class="sl-page sl-stack" id="main">
      <h1>{{ titleKey() | translate }}</h1>
      <section slCard="panel">
        <p>{{ 'placeholder.body' | translate }}</p>
      </section>
    </main>
  `,
})
export class PlaceholderPage {
  readonly titleKey = input.required<string>();
}

/** A route to a screen that isn't built yet; its title key also names the page. */
export function placeholder(path: string, titleKey: string, extra: Partial<Route> = {}): Route {
  return {
    path,
    title: titleKey,
    data: { titleKey },
    loadComponent: () => Promise.resolve(PlaceholderPage),
    ...extra,
  };
}

import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { TranslatePipe } from '@ngx-translate/core';

import { Toaster } from './shared/ui/toast';

@Component({
  selector: 'sl-root',
  imports: [RouterOutlet, Toaster, TranslatePipe],
  template: `
    <a class="sl-skip-link" href="#main">{{ 'common.skipToContent' | translate }}</a>
    <router-outlet />
    <sl-toaster />
  `,
})
export class App {}

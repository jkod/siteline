import { Component, DestroyRef, inject, signal } from '@angular/core';

import { LucideWifiOff } from '@lucide/angular';
import { TranslatePipe } from '@ngx-translate/core';

/** Shows when the connection drops (PRD section 13). */
@Component({
  selector: 'sl-offline-banner',
  imports: [TranslatePipe, LucideWifiOff],
  template: `
    <div role="status" aria-live="polite">
      @if (offline()) {
        <p class="banner">
          <svg lucideWifiOff [size]="18" aria-hidden="true"></svg>
          {{ 'offline.banner' | translate }}
        </p>
      }
    </div>
  `,
  styles: `
    .banner {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--sl-space-2);
      padding: var(--sl-space-2) var(--sl-space-4);
      background: var(--sl-dark);
      color: #fff;
      font: 600 14px/20px var(--sl-font-body);
    }
  `,
})
export class OfflineBanner {
  protected readonly offline = signal(!navigator.onLine);

  constructor() {
    const update = () => this.offline.set(!navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    });
  }
}

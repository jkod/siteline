import { Component, computed, signal } from '@angular/core';

import { LucideShare, LucideX } from '@lucide/angular';
import { TranslatePipe } from '@ngx-translate/core';

import { Button } from './button';

const VISITS_KEY = 'sl.visits';
const DISMISSED_KEY = 'sl.installHintDismissed';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

let deferredPrompt: InstallPromptEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
  });
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The hint then shows again next time; harmless.
  }
}

/**
 * "Add to home screen" from the second visit, with iPhone instructions (PRD F3). On iPhone, push
 * notifications only work once the app is on the home screen.
 */
@Component({
  selector: 'sl-install-hint',
  imports: [TranslatePipe, LucideShare, LucideX, Button],
  template: `
    @if (visible()) {
      <aside class="hint" [attr.aria-label]="'install.label' | translate">
        <div class="text">
          <p class="title">{{ 'install.title' | translate }}</p>
          @if (isIos) {
            <p>
              {{ 'install.iosBefore' | translate }}
              <svg lucideShare [size]="16" aria-hidden="true"></svg>
              {{ 'install.iosAfter' | translate }}
            </p>
          } @else {
            <p>{{ 'install.body' | translate }}</p>
          }
        </div>
        @if (!isIos && canPrompt()) {
          <button slButton type="button" (click)="install()">
            {{ 'install.add' | translate }}
          </button>
        }
        <button
          slButton="ghost"
          icon
          type="button"
          [attr.aria-label]="'common.dismiss' | translate"
          (click)="dismiss()"
        >
          <svg lucideX [size]="18"></svg>
        </button>
      </aside>
    }
  `,
  styles: `
    .hint {
      display: flex;
      align-items: center;
      gap: var(--sl-space-3);
      padding: var(--sl-space-3) var(--sl-space-2) var(--sl-space-3) var(--sl-space-4);
      background: var(--sl-accent-tint);
      border-radius: var(--sl-radius-panel);
    }
    .text {
      flex: 1;
    }
    .title {
      font-weight: 700;
    }
    svg {
      display: inline;
      vertical-align: -2px;
    }
  `,
})
export class InstallHint {
  protected readonly isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  private readonly standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  private readonly dismissed = signal(read(DISMISSED_KEY) === '1');
  private readonly visits: number;
  protected readonly canPrompt = signal(deferredPrompt !== null);
  protected readonly visible = computed(
    () =>
      !this.standalone && !this.dismissed() && this.visits >= 2 && (this.isIos || this.canPrompt()),
  );

  constructor() {
    const today = new Date().toDateString();
    const [count, last] = (read(VISITS_KEY) ?? '0|').split('|');
    this.visits = Number(count) + (last === today ? 0 : 1);
    write(VISITS_KEY, `${this.visits}|${today}`);
  }

  protected async install(): Promise<void> {
    await deferredPrompt?.prompt();
    deferredPrompt = null;
    this.dismiss();
  }

  protected dismiss(): void {
    write(DISMISSED_KEY, '1');
    this.dismissed.set(true);
  }
}

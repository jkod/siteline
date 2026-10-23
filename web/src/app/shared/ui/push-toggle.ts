import { Component, inject, OnInit } from '@angular/core';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { errorMessageKey } from '../../core/errors';
import { PushService } from '../../core/push';
import { Button } from './button';
import { Toasts } from './toast';

/** Turns browser notifications on or off for this browser (PRD section 6). */
@Component({
  selector: 'sl-push-toggle',
  imports: [TranslatePipe, Button],
  template: `
    <div class="sl-stack">
      <h2 id="push-title">{{ 'push.title' | translate }}</h2>
      @switch (push.state()) {
        @case ('unsupported') {
          <p>{{ (push.needsInstall ? 'push.install' : 'push.unsupported') | translate }}</p>
        }
        @case ('denied') {
          <p>{{ 'push.denied' | translate }}</p>
        }
        @case ('on') {
          <p>{{ 'push.on' | translate }}</p>
          <div>
            <button slButton="secondary" type="button" (click)="off()">
              {{ 'push.turnOff' | translate }}
            </button>
          </div>
        }
        @default {
          <p>{{ 'push.off' | translate }}</p>
          <div>
            <button
              slButton
              type="button"
              [busy]="push.state() === 'busy'"
              [disabled]="push.state() === 'busy'"
              (click)="on()"
            >
              {{ 'push.turnOn' | translate }}
            </button>
          </div>
        }
      }
    </div>
  `,
  styles: `
    h2 {
      font: var(--sl-text-section);
    }
  `,
})
export class PushToggle implements OnInit {
  protected readonly push = inject(PushService);
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);

  ngOnInit(): void {
    void this.push.refresh().catch(() => undefined);
  }

  protected async on(): Promise<void> {
    try {
      await this.push.enable();
      if (this.push.state() === 'on')
        this.toasts.show(this.translate.instant('push.enabled'), 'success');
    } catch (error) {
      this.toasts.show(this.translate.instant(errorMessageKey(error) ?? 'errors.unknown'), 'error');
    }
  }

  protected async off(): Promise<void> {
    await this.push.disable();
  }
}

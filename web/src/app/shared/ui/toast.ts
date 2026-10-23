import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injectable,
  signal,
} from '@angular/core';

import { TranslatePipe } from '@ngx-translate/core';

import { Icon } from './icon';

export type ToastKind = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  /** Already translated. */
  message: string;
  kind: ToastKind;
}

const INFO_DURATION_MS = 6000;

/**
 * Short messages at the bottom of the screen. Info and success toasts close by themselves (and
 * wait while hovered or focused); errors stay until dismissed.
 */
@Injectable({ providedIn: 'root' })
export class Toasts {
  private nextId = 0;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  private readonly items = signal<Toast[]>([]);
  readonly toasts = this.items.asReadonly();

  show(message: string, kind: ToastKind = 'info'): number {
    const id = this.nextId++;
    this.items.update((list) => [...list, { id, message, kind }]);
    if (kind !== 'error') this.schedule(id);
    return id;
  }

  dismiss(id: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this.items.update((list) => list.filter((t) => t.id !== id));
  }

  pause(id: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
  }

  resume(id: number): void {
    const toast = this.items().find((t) => t.id === id);
    if (toast && toast.kind !== 'error') this.schedule(id);
  }

  private schedule(id: number): void {
    this.timers.set(
      id,
      setTimeout(() => this.dismiss(id), INFO_DURATION_MS),
    );
  }
}

/** Renders toasts in live regions: polite for info and success, assertive for errors. */
@Component({
  selector: 'sl-toaster',
  imports: [Icon, NgTemplateOutlet, TranslatePipe],
  host: { popover: 'manual' },
  template: `
    <div class="region" role="status" aria-live="polite">
      @for (toast of polite(); track toast.id) {
        <ng-container [ngTemplateOutlet]="item" [ngTemplateOutletContext]="{ $implicit: toast }" />
      }
    </div>
    <div class="region" role="alert" aria-live="assertive">
      @for (toast of errors(); track toast.id) {
        <ng-container [ngTemplateOutlet]="item" [ngTemplateOutletContext]="{ $implicit: toast }" />
      }
    </div>
    <ng-template #item let-toast>
      <div
        class="toast"
        [class.error]="toast.kind === 'error'"
        (mouseenter)="toasts.pause(toast.id)"
        (mouseleave)="toasts.resume(toast.id)"
        (focusin)="toasts.pause(toast.id)"
        (focusout)="toasts.resume(toast.id)"
      >
        @if (toast.kind === 'error') {
          <sl-icon name="error" [size]="20" />
        } @else if (toast.kind === 'success') {
          <sl-icon name="check_circle" [size]="20" />
        }
        <span class="message">{{ toast.message }}</span>
        <button
          type="button"
          class="close"
          [attr.aria-label]="'common.dismiss' | translate"
          (click)="toasts.dismiss(toast.id)"
        >
          <sl-icon name="close" [size]="18" />
        </button>
      </div>
    </ng-template>
  `,
  styles: `
    /* An always-open manual popover lives in the top layer, so toasts show above dialogs. The
       popover's own box styles are reset; clicks pass through except on the toasts. */
    :host {
      position: fixed;
      inset: auto 0 0 0;
      z-index: 1100;
      width: 100%;
      height: auto;
      margin: 0;
      border: 0;
      background: transparent;
      overflow: visible;
      color: inherit;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--sl-space-2);
      padding: var(--sl-space-4);
      padding-bottom: max(var(--sl-space-4), env(safe-area-inset-bottom));
      pointer-events: none;
    }
    .region {
      display: contents;
    }
    .toast {
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: var(--sl-space-3);
      width: min(480px, 100%);
      padding: var(--sl-space-2) var(--sl-space-2) var(--sl-space-2) var(--sl-space-4);
      background: var(--sl-dark);
      color: #fff;
      border-radius: var(--sl-radius-panel);
      box-shadow: var(--sl-shadow-raised);
      animation: enter var(--sl-duration) var(--sl-ease);
    }
    .toast sl-icon {
      flex: none;
      color: var(--sl-highlight);
    }
    .toast.error sl-icon {
      color: #ffb4a6;
    }
    .message {
      flex: 1;
      padding: var(--sl-space-2) 0;
    }
    .close {
      display: grid;
      place-items: center;
      width: var(--sl-target);
      height: var(--sl-target);
      border: 0;
      border-radius: var(--sl-radius-pill);
      background: transparent;
      color: inherit;
      cursor: pointer;
    }
    .close sl-icon {
      color: inherit;
    }
    .close:hover {
      background: var(--sl-dark-2);
    }
    @keyframes enter {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
    }
  `,
})
export class Toaster {
  protected readonly toasts = inject(Toasts);

  constructor() {
    const host: HTMLElement = inject(ElementRef).nativeElement;
    afterNextRender(() => {
      if (typeof host.showPopover === 'function') host.showPopover();
    });
    // Dialogs open as popovers too, above earlier ones; a new toast lifts the toaster back on top.
    let count = 0;
    effect(() => {
      const now = this.toasts.toasts().length;
      if (now > count && host.matches?.(':popover-open')) {
        host.hidePopover();
        host.showPopover();
      }
      count = now;
    });
  }

  protected readonly polite = computed(() =>
    this.toasts.toasts().filter((t) => t.kind !== 'error'),
  );
  protected readonly errors = computed(() =>
    this.toasts.toasts().filter((t) => t.kind === 'error'),
  );
}

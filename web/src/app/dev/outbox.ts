import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';

import { TranslatePipe } from '@ngx-translate/core';

import { Button } from '../shared/ui/button';
import { Card } from '../shared/ui/card';
import {
  type DevMessage,
  type HeldMessage,
  listDevMessages,
  listHeldMessages,
  listSignInLinks,
  type SignInLink,
} from './emulator-api';

const REFRESH_MS = 3000;

/** Messages that would have been sent, and sign-in links from the Auth emulator. */
@Component({
  selector: 'sl-dev-outbox',
  imports: [DatePipe, TranslatePipe, Button, Card],
  template: `
    <main class="sl-page sl-stack" id="main">
      <h1>{{ 'pages.devOutbox' | translate }}</h1>
      <p class="sl-small">{{ 'dev.outboxIntro' | translate }}</p>
      @if (error()) {
        <p role="alert" slCard="panel">{{ 'dev.emulatorsDown' | translate }}</p>
      }

      <h2>{{ 'dev.signInLinks' | translate }}</h2>
      @for (link of links(); track link.link) {
        <article slCard class="row">
          <span>{{ link.email }}</span>
          <a slButton="secondary" [href]="link.link">{{ 'dev.openLink' | translate }}</a>
        </article>
      } @empty {
        <p class="sl-small">{{ 'dev.noLinks' | translate }}</p>
      }

      @if (held().length) {
        <h2>{{ 'dev.held' | translate }}</h2>
        @for (message of held(); track message.id) {
          <article slCard="panel" class="row">
            <span
              ><span class="channel">{{ message.channel }}</span> {{ message.template }}</span
            >
            <time [attr.datetime]="message.sendAfter">{{
              'dev.heldUntil' | translate: { when: (message.sendAfter | date: 'short') }
            }}</time>
          </article>
        }
      }

      <h2>{{ 'dev.messages' | translate }}</h2>
      @for (message of messages(); track message.id) {
        <article slCard class="message">
          <p class="meta">
            <span class="channel">{{ message.channel }}</span>
            <span>{{ message.to }}</span>
            @if (message.sender) {
              <span>{{ 'dev.from' | translate }} {{ message.sender }}</span>
            }
            <time [attr.datetime]="message.createdAt">{{ message.createdAt | date: 'short' }}</time>
          </p>
          @if (message.subject) {
            <p class="subject">{{ message.subject }}</p>
          }
          <p class="text">{{ message.text }}</p>
          <p class="sl-small">{{ 'dev.characters' | translate: { count: message.text.length } }}</p>
        </article>
      } @empty {
        <p class="sl-small">{{ 'dev.noMessages' | translate }}</p>
      }
    </main>
  `,
  styles: `
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--sl-space-3);
      flex-wrap: wrap;
    }
    .message {
      display: flex;
      flex-direction: column;
      gap: var(--sl-space-2);
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--sl-space-3);
      font: var(--sl-text-small);
      color: var(--sl-text-3);
    }
    .channel {
      font-weight: 700;
      text-transform: uppercase;
      color: var(--sl-accent-text);
    }
    .subject {
      font-weight: 700;
    }
    .text {
      white-space: pre-wrap;
    }
  `,
})
export class Outbox {
  protected readonly messages = signal<DevMessage[]>([]);
  protected readonly links = signal<SignInLink[]>([]);
  protected readonly held = signal<HeldMessage[]>([]);
  protected readonly error = signal(false);

  constructor() {
    void this.refresh();
    const timer = setInterval(() => void this.refresh(), REFRESH_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  private async refresh(): Promise<void> {
    try {
      const [messages, links, held] = await Promise.all([
        listDevMessages(),
        listSignInLinks(),
        listHeldMessages(),
      ]);
      this.messages.set(messages);
      this.links.set(links);
      this.held.set(held);
      this.error.set(false);
    } catch {
      this.error.set(true);
    }
  }
}

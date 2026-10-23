import { NgOptimizedImage } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { form, FormField, required, submit } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { environment } from '../../environments/environment';
import { Api } from '../core/api';
import { errorMessageKey } from '../core/errors';
import { Button } from '../shared/ui/button';
import { Card } from '../shared/ui/card';
import { Field, Input } from '../shared/ui/field';
import { Icon } from '../shared/ui/icon';
import { Toasts } from '../shared/ui/toast';

/**
 * "Logga in som kund": a client who has lost their link gets a new one-time link by text or
 * email. The page says the same whether or not the number or address is known.
 */
@Component({
  selector: 'sl-client-login',
  imports: [
    NgOptimizedImage,
    TranslatePipe,
    FormField,
    RouterLink,
    Button,
    Card,
    Field,
    Input,
    Icon,
  ],
  styleUrl: './auth-layout.css',
  template: `
    <main class="layout" id="main">
      <p class="brand">
        <img ngSrc="icons/favicon.svg" alt="" width="32" height="32" priority />
        Siteline
      </p>
      @if (sent()) {
        <section slCard class="sent" aria-labelledby="sent-title">
          <sl-icon name="mail" [size]="28" />
          <h1 id="sent-title">{{ 'clientLogin.sentTitle' | translate }}</h1>
          <p>{{ 'clientLogin.sentBody' | translate }}</p>
          @if (emulators) {
            <p class="sl-small">
              <a routerLink="/dev/outbox">{{ 'login.devOpenOutbox' | translate }}</a>
            </p>
          }
          <button slButton="secondary" type="button" (click)="sent.set(false)">
            {{ 'clientLogin.again' | translate }}
          </button>
        </section>
      } @else {
        <div class="sl-stack">
          <h1>{{ 'clientLogin.title' | translate }}</h1>
          <p class="intro">{{ 'clientLogin.intro' | translate }}</p>
        </div>
        <form novalidate (submit)="send($event)">
          <sl-field
            [label]="'clientLogin.contact' | translate"
            [errors]="form.contact().errors()"
            [touched]="form.contact().touched()"
          >
            <input slInput type="text" autocomplete="username" [formField]="form.contact" />
          </sl-field>
          <button
            slButton
            size="large"
            block
            type="submit"
            [busy]="sending()"
            [disabled]="sending()"
          >
            {{ 'clientLogin.send' | translate }}
          </button>
        </form>
      }
      <p class="sl-small">
        <a routerLink="/login">{{ 'clientLogin.staff' | translate }}</a>
      </p>
    </main>
  `,
})
export class ClientLogin {
  private readonly api = inject(Api);
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);

  protected readonly emulators = environment.emulators;
  protected readonly model = signal({ contact: '' });
  protected readonly form = form(this.model, (path) => required(path.contact));
  protected readonly sending = signal(false);
  protected readonly sent = signal(false);

  protected async send(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.form, async () => {
      this.sending.set(true);
      try {
        await this.api.requestClientSignIn(this.model().contact.trim());
        this.sent.set(true);
      } catch (error) {
        const key = errorMessageKey(error) ?? 'errors.unknown';
        this.toasts.show(this.translate.instant(key), 'error');
      } finally {
        this.sending.set(false);
      }
      return undefined;
    });
  }
}

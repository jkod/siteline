import { NgOptimizedImage } from '@angular/common';
import { Component, inject, input, signal } from '@angular/core';
import { email, form, FormField, required, submit } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';

import { LucideMail } from '@lucide/angular';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { environment } from '../../environments/environment';
import { errorMessageKey } from '../core/errors';
import { homeUrl } from '../core/home-url';
import { Session } from '../core/session';
import { Button } from '../shared/ui/button';
import { Card } from '../shared/ui/card';
import { Field, Input } from '../shared/ui/field';
import { LanguageSwitch } from '../shared/ui/language-switch';
import { Toasts } from '../shared/ui/toast';
import { safeReturnUrl } from './return-url';

/** Staff sign-in with an email link or Google; there are no passwords (PRD F1). */
@Component({
  selector: 'sl-login',
  imports: [
    NgOptimizedImage,
    TranslatePipe,
    FormField,
    RouterLink,
    LucideMail,
    Button,
    Card,
    Field,
    Input,
    LanguageSwitch,
  ],
  templateUrl: './login.html',
  styleUrl: './auth-layout.css',
})
export class Login {
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);

  /** From the query string, when a guard sent the person here. */
  readonly returnUrl = input<string>();

  protected readonly emulators = environment.emulators;
  protected readonly model = signal({ email: '' });
  protected readonly form = form(this.model, (path) => {
    required(path.email);
    email(path.email);
  });
  protected readonly sentTo = signal<string | null>(null);
  protected readonly sending = signal(false);
  protected readonly signingInWithGoogle = signal(false);

  protected async sendLink(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.form, async () => {
      this.sending.set(true);
      const address = this.model().email.trim();
      try {
        await this.session.sendEmailLink(address, this.finishUrl());
        this.sentTo.set(address);
      } catch (error) {
        this.showError(error);
      } finally {
        this.sending.set(false);
      }
      return undefined;
    });
  }

  protected async google(): Promise<void> {
    this.signingInWithGoogle.set(true);
    try {
      await this.session.signInWithGoogle();
      await this.router.navigateByUrl(
        safeReturnUrl(this.returnUrl()) ?? homeUrl(true, this.session.claims()),
      );
    } catch (error) {
      this.showError(error);
    } finally {
      this.signingInWithGoogle.set(false);
    }
  }

  protected useAnotherEmail(): void {
    this.sentTo.set(null);
  }

  private finishUrl(): string {
    const url = new URL('/login/finish', location.origin);
    const returnUrl = safeReturnUrl(this.returnUrl());
    if (returnUrl) url.searchParams.set('returnUrl', returnUrl);
    return url.toString();
  }

  private showError(error: unknown): void {
    const key = errorMessageKey(error);
    if (key) this.toasts.show(this.translate.instant(key), 'error');
  }
}

import { NgOptimizedImage } from '@angular/common';
import { Component, inject, input, type OnInit, signal } from '@angular/core';
import { email, form, FormField, required, submit } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';

import { TranslatePipe } from '@ngx-translate/core';

import { errorMessageKey } from '../core/errors';
import { homeUrl } from '../core/home-url';
import { Session } from '../core/session';
import { Button } from '../shared/ui/button';
import { Card } from '../shared/ui/card';
import { Field, Input } from '../shared/ui/field';
import { safeReturnUrl } from './return-url';

type State = 'working' | 'needEmail' | 'failed';

/**
 * Completes email-link sign-in. When the link is opened in another browser than the one that
 * asked for it, the person confirms their email first, as Firebase requires.
 */
@Component({
  selector: 'sl-login-finish',
  imports: [NgOptimizedImage, TranslatePipe, FormField, RouterLink, Button, Card, Field, Input],
  templateUrl: './login-finish.html',
  styleUrl: './auth-layout.css',
})
export class LoginFinish implements OnInit {
  private readonly session = inject(Session);
  private readonly router = inject(Router);

  readonly returnUrl = input<string>();

  protected readonly state = signal<State>('working');
  protected readonly errorKey = signal<string | null>(null);
  protected readonly model = signal({ email: '' });
  protected readonly form = form(this.model, (path) => {
    required(path.email);
    email(path.email);
  });
  protected readonly busy = signal(false);

  ngOnInit(): void {
    if (!this.session.isEmailLink(location.href)) {
      this.fail('errors.auth.invalid-action-code');
      return;
    }
    const stored = this.session.storedEmail();
    if (stored) {
      void this.complete(stored);
    } else {
      this.state.set('needEmail');
    }
  }

  protected async confirmEmail(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.form, async () => {
      await this.complete(this.model().email.trim());
      return undefined;
    });
  }

  private async complete(address: string): Promise<void> {
    this.busy.set(true);
    try {
      await this.session.completeEmailLink(address, location.href);
      await this.router.navigateByUrl(
        safeReturnUrl(this.returnUrl()) ?? homeUrl(true, this.session.claims()),
        { replaceUrl: true },
      );
    } catch (error) {
      this.fail(errorMessageKey(error) ?? 'errors.unknown');
    } finally {
      this.busy.set(false);
    }
  }

  private fail(key: string): void {
    this.errorKey.set(key);
    this.state.set('failed');
  }
}

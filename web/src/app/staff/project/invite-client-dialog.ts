import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';
import { email, form, FormField, required, submit, validate } from '@angular/forms/signals';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { normalizePhone } from '@siteline/shared';

import { Api } from '../../core/api';
import { errorMessageKey } from '../../core/errors';
import { Button } from '../../shared/ui/button';
import { dialogTitleId } from '../../shared/ui/dialog';
import { Field, Input } from '../../shared/ui/field';
import { Toasts } from '../../shared/ui/toast';

/** Name, mobile number and an optional email; the client gets a link by text (PRD 4.1). */
@Component({
  selector: 'sl-invite-client-dialog',
  imports: [TranslatePipe, FormField, Button, Field, Input],
  template: `
    <form class="body" novalidate (submit)="send($event)">
      <h2 [id]="titleId">{{ 'people.inviteTitle' | translate }}</h2>
      <p class="sl-small">{{ 'people.inviteIntro' | translate }}</p>
      <sl-field
        [label]="'people.name' | translate"
        [errors]="form.name().errors()"
        [touched]="form.name().touched()"
      >
        <input slInput type="text" autocomplete="off" [formField]="form.name" />
      </sl-field>
      <sl-field
        [label]="'people.mobile' | translate"
        [hint]="'people.mobileHint' | translate"
        [errors]="form.phone().errors()"
        [touched]="form.phone().touched()"
      >
        <input slInput type="tel" inputmode="tel" autocomplete="off" [formField]="form.phone" />
      </sl-field>
      <sl-field
        [label]="'people.email' | translate"
        [hint]="'common.optional' | translate"
        [errors]="form.email().errors()"
        [touched]="form.email().touched()"
      >
        <input slInput type="email" autocomplete="off" [formField]="form.email" />
      </sl-field>
      <div class="actions">
        <button slButton="secondary" type="button" (click)="ref.close()">
          {{ 'common.cancel' | translate }}
        </button>
        <button slButton type="submit" [busy]="sending()" [disabled]="sending()">
          {{ 'people.sendInvite' | translate }}
        </button>
      </div>
    </form>
  `,
  styles: `
    .body {
      display: flex;
      flex-direction: column;
      gap: var(--sl-space-4);
      padding: var(--sl-space-6);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--sl-space-3);
    }
  `,
})
export class InviteClientDialog {
  private readonly api = inject(Api);
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly data = inject<{ projectId: string }>(DIALOG_DATA);
  protected readonly titleId = dialogTitleId(this.ref);
  protected readonly sending = signal(false);
  protected readonly model = signal({ name: '', phone: '', email: '' });
  protected readonly form = form(this.model, (path) => {
    required(path.name);
    required(path.phone);
    validate(path.phone, ({ value }) =>
      value() && !normalizePhone(value()) ? { kind: 'phone' } : null,
    );
    email(path.email);
  });

  protected async send(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.form, async () => {
      this.sending.set(true);
      try {
        const m = this.model();
        await this.api.inviteClient({
          projectId: this.data.projectId,
          name: m.name,
          phone: m.phone,
          email: m.email,
        });
        this.toasts.show(this.translate.instant('people.inviteSent', { name: m.name }), 'success');
        this.ref.close(true);
      } catch (error) {
        const key = errorMessageKey(error);
        if (key) this.toasts.show(this.translate.instant(key), 'error');
      } finally {
        this.sending.set(false);
      }
      return undefined;
    });
  }
}

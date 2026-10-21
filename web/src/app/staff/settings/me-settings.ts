import { Component, effect, inject, signal } from '@angular/core';
import { form, FormField, maxLength, required, submit } from '@angular/forms/signals';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import type { Locale } from '@siteline/shared';

import { errorMessageKey } from '../../core/errors';
import { Language } from '../../core/language';
import { useFirestore } from '../../core/live';
import { Session } from '../../core/session';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { FeedStylePicker } from '../../shared/ui/feed-style-picker';
import { Field, Input } from '../../shared/ui/field';
import { Toasts } from '../../shared/ui/toast';
import { CurrentCompany } from '../current-company';

/** Name and language. Notifications arrive in M2; deleting the account in M4. */
@Component({
  selector: 'sl-me-settings',
  imports: [TranslatePipe, FormField, Button, Card, Field, Input, FeedStylePicker],
  styles: `
    .check {
      display: flex;
      align-items: center;
      gap: var(--sl-space-3);
      min-height: var(--sl-target);
    }
    .check input {
      width: 22px;
      height: 22px;
      accent-color: var(--sl-accent);
    }
  `,
  template: `
    <main class="sl-page sl-stack" id="main">
      <h1>{{ 'pages.settingsMe' | translate }}</h1>
      <form slCard class="sl-stack" novalidate (submit)="save($event)">
        <sl-field
          [label]="'me.name' | translate"
          [errors]="form.name().errors()"
          [touched]="form.name().touched()"
        >
          <input slInput type="text" autocomplete="name" [formField]="form.name" />
        </sl-field>
        <sl-field [label]="'companySettings.language' | translate">
          <select slInput [formField]="form.locale">
            <option value="sv">Svenska</option>
            <option value="en">English</option>
          </select>
        </sl-field>
        <label class="check">
          <input type="checkbox" [formField]="form.emailNotifications" />
          {{ 'me.emailNotifications' | translate }}
        </label>
        <p class="sl-small">{{ 'me.email' | translate: { email: email() } }}</p>
        <div>
          <button slButton type="submit" [busy]="saving()" [disabled]="saving()">
            {{ 'common.save' | translate }}
          </button>
        </div>
      </form>
      <section slCard>
        <sl-feed-style-picker />
      </section>
    </main>
  `,
})
export class MeSettings {
  private readonly session = inject(Session);
  private readonly language = inject(Language);
  private readonly company = inject(CurrentCompany);
  private readonly firestore = useFirestore();
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);

  protected readonly saving = signal(false);
  protected readonly email = () => this.session.user()?.email ?? '';
  protected readonly model = signal({ name: '', locale: 'sv' as Locale, emailNotifications: true });
  protected readonly form = form(this.model, (path) => {
    required(path.name);
    maxLength(path.name, 100);
  });

  constructor() {
    let loaded = false;
    effect(() => {
      const profile = this.session.profile();
      if (!profile || loaded || this.company.staff() === undefined) return;
      loaded = true;
      const staff = this.company.staff()?.find((s) => s.id === this.session.user()?.uid);
      this.model.set({
        name: profile.name,
        locale: profile.locale,
        emailNotifications: staff?.notify?.email !== false,
      });
    });
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.form, async () => {
      const uid = this.session.user()?.uid;
      const cid = this.session.claims().cid;
      if (!uid) return undefined;
      const { name, locale, emailNotifications } = this.model();
      const staff = this.company.staff()?.find((s) => s.id === uid);
      this.saving.set(true);
      try {
        await this.firestore(async (db, fs) => {
          const batch = fs.writeBatch(db);
          batch.update(fs.doc(db, 'users', uid), {
            name: name.trim(),
            locale,
            updatedAt: fs.serverTimestamp(),
          });
          if (cid) {
            batch.update(fs.doc(db, 'companies', cid, 'staff', uid), {
              name: name.trim(),
              notify: {
                push: true,
                quietHours: { start: '21:00', end: '07:00' },
                ...staff?.notify,
                email: emailNotifications,
              },
              updatedAt: fs.serverTimestamp(),
            });
          }
          await batch.commit();
        });
        await this.language.use(locale);
        this.toasts.show(this.translate.instant('me.saved'), 'success');
      } catch (error) {
        const key = errorMessageKey(error);
        if (key) this.toasts.show(this.translate.instant(key), 'error');
      } finally {
        this.saving.set(false);
      }
      return undefined;
    });
  }
}

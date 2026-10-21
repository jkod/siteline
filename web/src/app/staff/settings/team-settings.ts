import { Component, computed, inject, signal } from '@angular/core';
import { email, form, FormField, required, submit, validate } from '@angular/forms/signals';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { normalizePhone, type StaffRole } from '@siteline/shared';

import { Api } from '../../core/api';
import { errorMessageKey, errorReason } from '../../core/errors';
import { Session } from '../../core/session';
import { Avatar } from '../../shared/ui/avatar';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { Dialogs } from '../../shared/ui/dialog';
import { Field, Input } from '../../shared/ui/field';
import { Toasts } from '../../shared/ui/toast';
import { CurrentCompany } from '../current-company';
import { usePlanLimitDialog } from '../plan-limit';

/** Staff, invites and roles (PRD F1). The server keeps at least one owner. */
@Component({
  selector: 'sl-team-settings',
  imports: [TranslatePipe, FormField, Avatar, Button, Card, Field, Input],
  templateUrl: './team-settings.html',
  styleUrl: './settings.css',
})
export class TeamSettings {
  protected readonly company = inject(CurrentCompany);
  private readonly session = inject(Session);
  private readonly api = inject(Api);
  private readonly dialogs = inject(Dialogs);
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);
  private readonly planLimit = usePlanLimitDialog();

  protected readonly isOwner = computed(() => this.session.role() === 'owner');
  protected readonly uid = computed(() => this.session.user()?.uid);
  protected readonly sending = signal(false);
  protected readonly model = signal({
    name: '',
    email: '',
    phone: '',
    role: 'crew' as 'crew' | 'admin',
  });
  protected readonly form = form(this.model, (path) => {
    required(path.name);
    email(path.email);
    validate(path.phone, ({ value }) =>
      value() && !normalizePhone(value()) ? { kind: 'phone' } : null,
    );
    validate(path.email, ({ value, valueOf }) =>
      !value() && !valueOf(path.phone) ? { kind: 'emailOrPhone' } : null,
    );
  });

  protected roleOptions(current: StaffRole): StaffRole[] {
    return this.isOwner() || current === 'owner' ? ['owner', 'admin', 'crew'] : ['admin', 'crew'];
  }

  protected async invite(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.form, async () => {
      this.sending.set(true);
      try {
        const m = this.model();
        await this.api.inviteStaff({ name: m.name, email: m.email, phone: m.phone, role: m.role });
        this.toasts.show(this.translate.instant('team.inviteSent', { name: m.name }), 'success');
        this.model.set({ name: '', email: '', phone: '', role: 'crew' });
        this.form().reset();
      } catch (error) {
        await this.handle(error);
      } finally {
        this.sending.set(false);
      }
      return undefined;
    });
  }

  protected async changeRole(uid: string, role: StaffRole): Promise<void> {
    try {
      await this.api.setStaffRole(uid, role);
      this.toasts.show(this.translate.instant('team.roleChanged'), 'success');
    } catch (error) {
      await this.handle(error);
    }
  }

  protected async remove(uid: string, name: string): Promise<void> {
    const t = (key: string) => this.translate.instant(key, { name }) as string;
    const ok = await this.dialogs.confirm({
      title: t('team.removeTitle'),
      message: t('team.removeBody'),
      confirmLabel: t('team.removeConfirm'),
      cancelLabel: t('common.cancel'),
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.removeStaff(uid);
      this.toasts.show(t('team.removed'), 'success');
    } catch (error) {
      await this.handle(error);
    }
  }

  private async handle(error: unknown): Promise<void> {
    if (errorReason(error) === 'plan_limit') return this.planLimit();
    const key = errorMessageKey(error);
    if (key) this.toasts.show(this.translate.instant(key), 'error');
  }
}

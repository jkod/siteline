import { Component, computed, inject, signal } from '@angular/core';
import { form, FormField, maxLength, required, submit, validate } from '@angular/forms/signals';
import { Router } from '@angular/router';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  DEFAULT_ACCENT,
  isValidOrgNumber,
  type Locale,
  LOGO_MAX_BYTES,
  normalizePhone,
} from '@siteline/shared';

import { Api } from '../core/api';
import { errorMessageKey, errorReason } from '../core/errors';
import { FirebaseService } from '../core/firebase';
import { Language } from '../core/language';
import { useFirestore } from '../core/live';
import { forgetReferralCode, pendingReferralCode } from '../core/referral-code';
import { Session } from '../core/session';
import { BrandPreview } from '../shared/ui/brand-preview';
import { Button } from '../shared/ui/button';
import { Card } from '../shared/ui/card';
import { Field, Input } from '../shared/ui/field';
import { Toasts } from '../shared/ui/toast';

type Step = 'company' | 'project' | 'client';
const LOGO_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg',
};

/**
 * First sign-in: company details with a live preview of the client view, then the first project
 * and the first client invite. Built to take under three minutes (PRD F1).
 */
@Component({
  selector: 'sl-onboarding',
  imports: [TranslatePipe, FormField, BrandPreview, Button, Card, Field, Input],
  templateUrl: './onboarding.html',
  styleUrl: './onboarding.css',
})
export class Onboarding {
  private readonly session = inject(Session);
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly firebase = inject(FirebaseService);
  private readonly firestore = useFirestore();
  private readonly language = inject(Language);
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);

  protected readonly step = signal<Step>('company');
  protected readonly stepNumber = computed(
    () => ({ company: 1, project: 2, client: 3 })[this.step()],
  );
  protected readonly busy = signal(false);
  protected readonly logo = signal<File | null>(null);
  protected readonly logoPreview = signal<string | null>(null);
  private projectId = '';

  protected readonly company = signal({
    name: '',
    ownerName: this.session.user()?.displayName ?? '',
    orgNumber: '',
    accentColor: DEFAULT_ACCENT,
    locale: this.language.lang() as Locale,
  });
  protected readonly companyForm = form(this.company, (path) => {
    required(path.name);
    maxLength(path.name, 80);
    required(path.ownerName);
    validate(path.orgNumber, ({ value }) =>
      value() && !isValidOrgNumber(value()) ? { kind: 'orgNumber' } : null,
    );
    validate(path.accentColor, ({ value }) =>
      /^#[0-9a-fA-F]{6}$/.test(value()) ? null : { kind: 'color' },
    );
  });
  protected readonly accent = computed(() =>
    /^#[0-9a-fA-F]{6}$/.test(this.company().accentColor)
      ? this.company().accentColor
      : DEFAULT_ACCENT,
  );

  protected readonly project = signal({ title: '', street: '', city: '', startDate: '' });
  protected readonly projectForm = form(this.project, (path) => {
    required(path.title);
    maxLength(path.title, 120);
  });

  protected readonly client = signal({ name: '', phone: '' });
  protected readonly clientForm = form(this.client, (path) => {
    required(path.name);
    required(path.phone);
    validate(path.phone, ({ value }) =>
      value() && !normalizePhone(value()) ? { kind: 'phone' } : null,
    );
  });

  protected pickLogo(files: FileList | null): void {
    const file = files?.[0];
    if (!file) return;
    if (!LOGO_TYPES[file.type] || file.size > LOGO_MAX_BYTES) {
      this.toasts.show(this.translate.instant('companySettings.logoInvalid'), 'error');
      return;
    }
    this.logo.set(file);
    this.logoPreview.set(URL.createObjectURL(file));
  }

  protected async createCompany(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.companyForm, async () => {
      const c = this.company();
      await this.busyWhile(async () => {
        try {
          const { companyId } = await this.api.createCompany({
            name: c.name,
            ownerName: c.ownerName,
            orgNumber: c.orgNumber,
            accentColor: c.accentColor,
            locale: c.locale,
            referralCode: pendingReferralCode() ?? undefined,
          });
          forgetReferralCode();
          await this.session.refreshClaims();
          await this.language.use(c.locale);
          await this.uploadLogo(companyId);
          this.step.set('project');
        } catch (error) {
          if (errorReason(error) === 'already_in_company') {
            await this.session.refreshClaims();
            await this.router.navigateByUrl('/app');
            return;
          }
          throw error;
        }
      });
      return undefined;
    });
  }

  protected async createProject(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.projectForm, async () => {
      const p = this.project();
      await this.busyWhile(async () => {
        const hasAddress = p.street || p.city;
        const { projectId } = await this.api.createProject({
          kind: 'project',
          title: p.title,
          address: hasAddress ? { street: p.street, postalCode: '', city: p.city } : null,
          startDate: p.startDate || null,
        });
        this.projectId = projectId;
        this.step.set('client');
      });
      return undefined;
    });
  }

  protected async inviteClient(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.clientForm, async () => {
      const c = this.client();
      await this.busyWhile(async () => {
        await this.api.inviteClient({ projectId: this.projectId, name: c.name, phone: c.phone });
        this.toasts.show(this.translate.instant('people.inviteSent', { name: c.name }), 'success');
        await this.finish();
      });
      return undefined;
    });
  }

  protected finish(): Promise<boolean> {
    return this.router.navigate(['/app/projects', this.projectId]);
  }

  private async uploadLogo(companyId: string): Promise<void> {
    const file = this.logo();
    if (!file) return;
    try {
      const path = `companies/${companyId}/logo.${LOGO_TYPES[file.type]}`;
      const [storage, s] = await Promise.all([this.firebase.storage(), import('firebase/storage')]);
      await s.uploadBytes(s.ref(storage, path), file, { contentType: file.type });
      await this.firestore((db, fs) =>
        fs.updateDoc(fs.doc(db, 'companies', companyId), {
          logoPath: path,
          updatedAt: fs.serverTimestamp(),
        }),
      );
    } catch {
      // The logo can be added later in settings; don't block onboarding.
      this.toasts.show(this.translate.instant('onboarding.logoLater'), 'info');
    }
  }

  private async busyWhile(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
    } catch (error) {
      const key = errorMessageKey(error);
      if (key) this.toasts.show(this.translate.instant(key), 'error');
    } finally {
      this.busy.set(false);
    }
  }
}

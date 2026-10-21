import { Component, computed, effect, inject, signal } from '@angular/core';
import { form, FormField, maxLength, required, submit, validate } from '@angular/forms/signals';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  accentTextColor,
  contrastRatio,
  isValidOrgNumber,
  type Locale,
  LOGO_MAX_BYTES,
} from '@siteline/shared';

import { errorMessageKey } from '../../core/errors';
import { FirebaseService } from '../../core/firebase';
import { useFirestore } from '../../core/live';
import { MediaService } from '../../core/media';
import { BrandPreview } from '../../shared/ui/brand-preview';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { Field, Input } from '../../shared/ui/field';
import { Toasts } from '../../shared/ui/toast';
import { CurrentCompany } from '../current-company';

const LOGO_TYPES: Record<string, 'png' | 'jpg' | 'svg'> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg',
};

/** Company profile and branding, with a live preview of the client view (PRD F1). */
@Component({
  selector: 'sl-company-settings',
  imports: [TranslatePipe, FormField, BrandPreview, Button, Card, Field, Input],
  templateUrl: './company-settings.html',
  styleUrl: './settings.css',
})
export class CompanySettings {
  private readonly company = inject(CurrentCompany);
  private readonly firebase = inject(FirebaseService);
  private readonly media = inject(MediaService);
  private readonly firestore = useFirestore();
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);

  protected readonly saving = signal(false);
  protected readonly logoUrl = signal<string | null>(null);
  protected readonly model = signal({
    name: '',
    orgNumber: '',
    accentColor: '#127A69',
    locale: 'sv' as Locale,
    crewCanSendPricedCards: false,
  });
  protected readonly form = form(this.model, (path) => {
    required(path.name);
    maxLength(path.name, 80);
    validate(path.orgNumber, ({ value }) =>
      value() && !isValidOrgNumber(value()) ? { kind: 'orgNumber' } : null,
    );
    validate(path.accentColor, ({ value }) =>
      /^#[0-9a-fA-F]{6}$/.test(value()) ? null : { kind: 'color' },
    );
  });
  protected readonly accent = computed(() =>
    /^#[0-9a-fA-F]{6}$/.test(this.model().accentColor) ? this.model().accentColor : '#127A69',
  );
  /** Accents below 4.5:1 on white still fill buttons; text uses a darker shade (PRD F1). */
  protected readonly lowContrast = computed(() => contrastRatio(this.accent(), '#FFFFFF') < 4.5);
  protected readonly textShade = computed(() => accentTextColor(this.accent()));

  constructor() {
    let loaded = false;
    effect(() => {
      const c = this.company.company();
      if (!c || loaded) return;
      loaded = true;
      this.model.set({
        name: c.name,
        orgNumber: c.orgNumber ?? '',
        accentColor: c.accentColor,
        locale: c.locale,
        crewCanSendPricedCards: c.settings.crewCanSendPricedCards,
      });
      if (c.logoPath) void this.media.url(c.logoPath).then((url) => this.logoUrl.set(url));
    });
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.form, async () => {
      const c = this.company.company();
      if (!c) return undefined;
      const m = this.model();
      this.saving.set(true);
      try {
        await this.firestore((db, fs) =>
          fs.updateDoc(fs.doc(db, 'companies', c.id), {
            name: m.name.trim(),
            orgNumber: m.orgNumber.trim() || null,
            accentColor: m.accentColor.toUpperCase(),
            locale: m.locale,
            settings: { ...c.settings, crewCanSendPricedCards: m.crewCanSendPricedCards },
            updatedAt: fs.serverTimestamp(),
          }),
        );
        this.toasts.show(this.translate.instant('companySettings.saved'), 'success');
      } catch (error) {
        this.showError(error);
      } finally {
        this.saving.set(false);
      }
      return undefined;
    });
  }

  protected async uploadLogo(files: FileList | null): Promise<void> {
    const file = files?.[0];
    const c = this.company.company();
    if (!file || !c) return;
    const ext = LOGO_TYPES[file.type];
    if (!ext || file.size > LOGO_MAX_BYTES) {
      this.toasts.show(this.translate.instant('companySettings.logoInvalid'), 'error');
      return;
    }
    try {
      const path = `companies/${c.id}/logo.${ext}`;
      const [storage, s] = await Promise.all([this.firebase.storage(), import('firebase/storage')]);
      await s.uploadBytes(s.ref(storage, path), file, { contentType: file.type });
      await this.firestore((db, fs) =>
        fs.updateDoc(fs.doc(db, 'companies', c.id), {
          logoPath: path,
          updatedAt: fs.serverTimestamp(),
        }),
      );
      this.logoUrl.set(URL.createObjectURL(file));
      this.toasts.show(this.translate.instant('companySettings.logoSaved'), 'success');
    } catch (error) {
      this.showError(error);
    }
  }

  private showError(error: unknown): void {
    const key = errorMessageKey(error);
    if (key) this.toasts.show(this.translate.instant(key), 'error');
  }
}

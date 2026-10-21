import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { form, FormField, maxLength, required, submit, validate } from '@angular/forms/signals';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  type Decision,
  type DecisionFields,
  type DecisionKind,
  kronorToOre,
  type Media,
} from '@siteline/shared';

import { Api } from '../../core/api';
import { errorMessageKey } from '../../core/errors';
import { MediaService } from '../../core/media';
import { Button } from '../ui/button';
import { dialogTitleId } from '../ui/dialog';
import { Field, Input } from '../ui/field';
import { Icon } from '../ui/icon';
import { StorageImage } from '../ui/storage-image';
import { Toasts } from '../ui/toast';

export interface DecisionEditorData {
  projectId: string;
  /** Editing an existing draft or sent card; omitted for a new one. */
  postId?: string;
  decision?: Decision;
  media?: Media[];
  /** A sent card is revised: the old version is superseded and a new one is sent. */
  mode: 'new' | 'draft' | 'revise';
}

interface OptionRow {
  id: string;
  label: string;
  delta: string;
}

const KINDS: DecisionKind[] = ['extra_work', 'choice', 'approval'];

/** Parses "6 500" or "6500,50" kronor into öre; empty is undefined. */
export function parseKronor(value: string): number | undefined | null {
  const clean = value.replace(/\s|kr/gi, '').replace(',', '.');
  if (!clean) return undefined;
  const n = Number(clean);
  return Number.isFinite(n) ? kronorToOre(n) : null;
}

const oreToKronor = (ore: number | undefined) =>
  ore === undefined ? '' : String(ore / 100).replace('.', ',');

/** Creates or edits a decision card: extra work (ÄTA), a choice, or an approval (PRD F6). */
@Component({
  selector: 'sl-decision-editor',
  imports: [Icon, TranslatePipe, FormField, Button, Field, Input, StorageImage],
  templateUrl: './decision-editor.html',
  styleUrl: './decision-editor.css',
})
export class DecisionEditor {
  private readonly api = inject(Api);
  private readonly media = inject(MediaService);
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);
  protected readonly ref = inject<DialogRef<string>>(DialogRef);
  protected readonly data = inject<DecisionEditorData>(DIALOG_DATA);
  protected readonly titleId = dialogTitleId(this.ref);
  protected readonly kinds = KINDS;

  private readonly existing = this.data.decision;
  protected readonly kind = signal<DecisionKind>(this.existing?.kind ?? 'extra_work');
  protected readonly model = signal({
    title: this.existing?.title ?? '',
    description: this.existing?.description ?? '',
    price: oreToKronor(this.existing?.priceOre),
    labour: oreToKronor(this.existing?.labourOre),
    material: oreToKronor(this.existing?.materialOre),
    respondBy: '',
  });
  protected readonly options = signal<OptionRow[]>(
    this.existing?.options?.map((o) => ({
      id: o.id,
      label: o.label,
      delta: oreToKronor(o.priceDeltaOre),
    })) ?? [
      { id: 'a', label: '', delta: '' },
      { id: 'b', label: '', delta: '' },
    ],
  );
  protected readonly photos = signal<Media[]>(this.data.media ?? []);
  protected readonly uploading = signal(false);
  protected readonly saving = signal<'draft' | 'send' | null>(null);
  protected readonly optionsError = signal(false);

  protected readonly form = form(this.model, (path) => {
    required(path.title);
    maxLength(path.title, 120);
    maxLength(path.description, 2000);
    validate(path.price, ({ value }) =>
      this.kind() === 'extra_work' &&
      (parseKronor(value()) === undefined || parseKronor(value()) === null)
        ? { kind: 'price' }
        : null,
    );
    validate(path.labour, ({ value }) =>
      parseKronor(value()) === null ? { kind: 'price' } : null,
    );
    validate(path.material, ({ value }) =>
      parseKronor(value()) === null ? { kind: 'price' } : null,
    );
  });

  protected readonly heading = computed(() =>
    this.data.mode === 'revise'
      ? 'decisions.editor.reviseTitle'
      : this.data.mode === 'draft'
        ? 'decisions.editor.editTitle'
        : 'decisions.editor.newTitle',
  );

  protected addOption(): void {
    const used = new Set(this.options().map((o) => o.id));
    const id = 'abcdef'.split('').find((c) => !used.has(c)) ?? String(Date.now());
    this.options.update((list) => [...list, { id, label: '', delta: '' }]);
  }

  protected removeOption(index: number): void {
    this.options.update((list) => list.filter((_, i) => i !== index));
  }

  protected setOption(index: number, field: 'label' | 'delta', value: string): void {
    this.options.update((list) => list.map((o, i) => (i === index ? { ...o, [field]: value } : o)));
  }

  protected async addPhotos(files: FileList | null): Promise<void> {
    const list = Array.from(files ?? []).slice(0, 20 - this.photos().length);
    if (!list.length) return;
    this.uploading.set(true);
    try {
      for (const file of list) {
        const uploaded = await this.media.upload(this.data.projectId, file, () => undefined);
        this.photos.update((p) => [...p, uploaded]);
      }
    } catch (error) {
      this.showError(error);
    } finally {
      this.uploading.set(false);
    }
  }

  protected removePhoto(index: number): void {
    this.photos.update((list) => list.filter((_, i) => i !== index));
  }

  protected async save(event: Event, action: 'draft' | 'send'): Promise<void> {
    event.preventDefault();
    const options = this.options().filter((o) => o.label.trim());
    const choiceInvalid =
      this.kind() === 'choice' &&
      (options.length < 2 || options.some((o) => parseKronor(o.delta) === null));
    this.optionsError.set(choiceInvalid);
    await submit(this.form, async () => {
      if (choiceInvalid) return undefined;
      const m = this.model();
      const decision: DecisionFields = {
        kind: this.kind(),
        title: m.title,
        description: m.description,
        media: this.photos(),
        respondBy: m.respondBy || null,
      };
      if (this.kind() === 'extra_work') {
        decision.priceOre = parseKronor(m.price) ?? 0;
        const labour = parseKronor(m.labour);
        const material = parseKronor(m.material);
        if (labour != null) decision.labourOre = labour;
        if (material != null) decision.materialOre = material;
      }
      if (this.kind() === 'choice') {
        decision.options = options.map((o) => ({
          id: o.id,
          label: o.label.trim(),
          ...(parseKronor(o.delta) ? { priceDeltaOre: parseKronor(o.delta)! } : {}),
        }));
      }
      this.saving.set(action);
      try {
        let postId = this.data.postId;
        if (this.data.mode === 'revise') {
          postId = (await this.api.reviseDecision(this.data.projectId, postId!, decision)).postId;
        } else {
          postId = (await this.api.saveDecisionDraft(this.data.projectId, decision, postId)).postId;
          if (action === 'send') await this.api.sendDecision(this.data.projectId, postId);
        }
        const done =
          this.data.mode === 'revise' || action === 'send'
            ? 'decisions.sent'
            : 'decisions.draftSaved';
        this.toasts.show(this.translate.instant(done), 'success');
        this.ref.close(postId);
      } catch (error) {
        this.showError(error);
      } finally {
        this.saving.set(null);
      }
      return undefined;
    });
  }

  private showError(error: unknown): void {
    const key = errorMessageKey(error);
    if (key) this.toasts.show(this.translate.instant(key), 'error');
  }
}

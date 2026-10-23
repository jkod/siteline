import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import type {
  BookingRequest,
  Handover,
  HandoverAttachment,
  Material,
  Media,
  Reminder,
} from '@siteline/shared';

import { Api } from '../../core/api';
import { errorMessageKey } from '../../core/errors';
import { liveDoc, liveQuery } from '../../core/live';
import { MediaService } from '../../core/media';
import { ProjectContext } from '../../core/project-context';
import { type PhotoPickerData, PhotoPickerDialog } from '../../shared/handover/photo-picker-dialog';
import { DatePipe } from '../../shared/pipes/date';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { Dialogs } from '../../shared/ui/dialog';
import { Field, Input } from '../../shared/ui/field';
import { StorageImage } from '../../shared/ui/storage-image';
import { Toasts } from '../../shared/ui/toast';
import { CurrentCompany } from '../current-company';

type Pair = Handover['beforeAfter'][number];
const ATTACHMENT_MAX = 20 * 1024 * 1024;
const emptyMaterial = (): Material => ({
  name: '',
  brand: '',
  colourCode: '',
  supplier: '',
  warrantyYears: null,
});

/**
 * The handover editor (PRD F9): summary, before-and-after pairs from the project's photos,
 * materials, care notes and attachments; generating the PDF, with earlier versions; aftercare
 * reminders (F13, Team) and clients' booking requests. Owners and admins.
 */
@Component({
  selector: 'sl-project-handover',
  imports: [TranslatePipe, RouterLink, DatePipe, Button, Card, Field, Input, StorageImage],
  templateUrl: './project-handover.html',
  styleUrl: './project-handover.css',
})
export class ProjectHandover {
  private readonly context = inject(ProjectContext);
  protected readonly company = inject(CurrentCompany);
  private readonly api = inject(Api);
  private readonly media = inject(MediaService);
  private readonly dialogs = inject(Dialogs);
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);

  protected readonly projectId = computed(() => this.context.projectId() ?? '');
  protected readonly handover = liveDoc<Handover>(() =>
    this.projectId() ? `projects/${this.projectId()}/handover/current` : null,
  );
  protected readonly reminders = liveQuery<Reminder>(
    (db, fs) =>
      this.projectId()
        ? fs.query(
            fs.collection(db, 'projects', this.projectId(), 'reminders'),
            fs.orderBy('nextSendAt'),
          )
        : null,
    () => this.projectId(),
  );
  protected readonly bookings = liveQuery<BookingRequest>(
    (db, fs) =>
      this.projectId()
        ? fs.query(
            fs.collection(db, 'projects', this.projectId(), 'bookingRequests'),
            fs.where('status', '==', 'open'),
            fs.orderBy('createdAt', 'desc'),
          )
        : null,
    () => this.projectId(),
  );

  protected readonly summary = signal('');
  protected readonly careNotes = signal('');
  protected readonly pairs = signal<Pair[]>([]);
  protected readonly materials = signal<Material[]>([]);
  protected readonly attachments = signal<HandoverAttachment[]>([]);
  protected readonly saving = signal(false);
  protected readonly generating = signal(false);
  protected readonly uploading = signal(false);
  protected readonly versions = computed(() => [...(this.handover()?.versions ?? [])].reverse());

  protected readonly reminder = signal({
    title: '',
    note: '',
    dueDate: '',
    repeat: 'yearly' as 'none' | 'yearly',
  });
  protected readonly savingReminder = signal(false);

  constructor() {
    // Fill the editor once from what's stored.
    let loaded = false;
    effect(() => {
      const stored = this.handover();
      if (loaded || stored === undefined) return;
      loaded = true;
      this.summary.set(stored?.summary ?? '');
      this.careNotes.set(stored?.careNotes ?? '');
      this.pairs.set(stored?.beforeAfter ?? []);
      this.materials.set(stored?.materials ?? []);
      this.attachments.set(stored?.attachments ?? []);
    });
  }

  protected async addPair(): Promise<void> {
    const before = await this.pick('handover.pickBefore');
    if (!before) return;
    const after = await this.pick('handover.pickAfter');
    if (!after) return;
    this.pairs.update((list) => [...list, { before, after, caption: '' }]);
  }

  protected setCaption(index: number, caption: string): void {
    this.pairs.update((list) => list.map((p, i) => (i === index ? { ...p, caption } : p)));
  }

  protected removePair(index: number): void {
    this.pairs.update((list) => list.filter((_, i) => i !== index));
  }

  protected addMaterial(): void {
    this.materials.update((list) => [...list, emptyMaterial()]);
  }

  protected setMaterial(index: number, field: keyof Material, value: string): void {
    this.materials.update((list) =>
      list.map((m, i) =>
        i !== index
          ? m
          : {
              ...m,
              [field]: field === 'warrantyYears' ? (value === '' ? null : Number(value)) : value,
            },
      ),
    );
  }

  protected removeMaterial(index: number): void {
    this.materials.update((list) => list.filter((_, i) => i !== index));
  }

  protected async attach(files: FileList | null): Promise<void> {
    const chosen = Array.from(files ?? []);
    if (
      chosen.some(
        (f) => f.size > ATTACHMENT_MAX || !/^(application\/pdf|image\/(jpeg|png))$/.test(f.type),
      )
    ) {
      this.toasts.show(this.translate.instant('handover.attachmentInvalid'), 'error');
      return;
    }
    this.uploading.set(true);
    try {
      for (const file of chosen) {
        const attachment = await this.media.uploadAttachment(this.projectId(), file);
        this.attachments.update((list) => [...list, attachment]);
      }
    } catch (error) {
      this.showError(error);
    } finally {
      this.uploading.set(false);
    }
  }

  protected removeAttachment(index: number): void {
    this.attachments.update((list) => list.filter((_, i) => i !== index));
  }

  protected async open(path: string): Promise<void> {
    window.open(await this.media.url(path), '_blank', 'noopener');
  }

  protected async save(): Promise<boolean> {
    this.saving.set(true);
    try {
      await this.api.saveHandover({
        projectId: this.projectId(),
        summary: this.summary(),
        careNotes: this.careNotes(),
        beforeAfter: this.pairs(),
        materials: this.materials().filter((m) => m.name.trim()),
        attachments: this.attachments(),
      });
      this.toasts.show(this.translate.instant('handover.saved'), 'success');
      return true;
    } catch (error) {
      this.showError(error);
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  /** Saves, then builds the PDF; this completes the project and tells the clients. */
  protected async generate(): Promise<void> {
    const t = (key: string) => this.translate.instant(key) as string;
    const ok = await this.dialogs.confirm({
      title: t('handover.generateTitle'),
      message: t('handover.generateBody'),
      confirmLabel: t('handover.generate'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok || !(await this.save())) return;
    this.generating.set(true);
    try {
      const { version } = await this.api.generateHandover(this.projectId());
      this.toasts.show(this.translate.instant('handover.generated', { version }), 'success');
    } catch (error) {
      this.showError(error);
    } finally {
      this.generating.set(false);
    }
  }

  protected setReminder(field: 'title' | 'note' | 'dueDate' | 'repeat', value: string): void {
    this.reminder.update((r) => ({ ...r, [field]: value }));
  }

  protected async addReminder(event: Event): Promise<void> {
    event.preventDefault();
    const r = this.reminder();
    if (!r.title.trim() || !r.dueDate) return;
    this.savingReminder.set(true);
    try {
      await this.api.saveReminder({ projectId: this.projectId(), ...r });
      this.reminder.set({ title: '', note: '', dueDate: '', repeat: 'yearly' });
      this.toasts.show(this.translate.instant('aftercare.saved'), 'success');
    } catch (error) {
      this.showError(error);
    } finally {
      this.savingReminder.set(false);
    }
  }

  protected async removeReminder(id: string): Promise<void> {
    try {
      await this.api.deleteReminder(this.projectId(), id);
    } catch (error) {
      this.showError(error);
    }
  }

  protected async resolve(id: string): Promise<void> {
    try {
      await this.api.resolveBooking(this.projectId(), id);
    } catch (error) {
      this.showError(error);
    }
  }

  protected size(bytes: number): string {
    return bytes > 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
      : `${Math.ceil(bytes / 1024)} kB`;
  }

  private async pick(titleKey: string): Promise<Media | undefined> {
    const ref = this.dialogs.open<Media, PhotoPickerData, PhotoPickerDialog>(
      PhotoPickerDialog,
      {
        projectId: this.projectId(),
        titleKey,
      },
      { wide: true },
    );
    const { firstValueFrom } = await import('rxjs');
    return firstValueFrom(ref.closed);
  }

  private showError(error: unknown): void {
    this.toasts.show(this.translate.instant(errorMessageKey(error) ?? 'errors.unknown'), 'error');
  }
}

import { Component, computed, effect, inject, input } from '@angular/core';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import type { Handover, ProjectMember, Reminder } from '@siteline/shared';

import { errorMessageKey } from '../core/errors';
import { liveDoc, liveQuery, useFirestore } from '../core/live';
import { MediaService } from '../core/media';
import { ProjectContext } from '../core/project-context';
import { Session } from '../core/session';
import { DatePipe } from '../shared/pipes/date';
import { Button } from '../shared/ui/button';
import { Card } from '../shared/ui/card';
import { Dialogs } from '../shared/ui/dialog';
import { EmptyState } from '../shared/ui/empty-state';
import { Toasts } from '../shared/ui/toast';
import { type BookingData, BookingDialog } from './booking-dialog';

/**
 * The client's handover (PRD F3, F9): the pack to download at any time, also once the project
 * is archived; the attachments; aftercare reminders, which they can turn off, and "Book again"
 * (F13).
 */
@Component({
  selector: 'sl-client-handover',
  imports: [TranslatePipe, DatePipe, Button, Card, EmptyState],
  template: `
    @let h = handover();
    @if (h?.pdf; as pdf) {
      <section slCard class="sl-stack" aria-labelledby="pack-title">
        <h2 id="pack-title">{{ 'handover.pack' | translate }}</h2>
        <p class="sl-small">
          {{
            'handover.readyAt'
              | translate: { date: (pdf.generatedAt | slDate: 'date'), n: pdf.version }
          }}
        </p>
        <div>
          <button slButton size="large" type="button" (click)="open(pdf.path)">
            {{ 'handover.download' | translate }}
          </button>
        </div>
      </section>
      @if (h!.attachments.length) {
        <section slCard class="sl-stack" aria-labelledby="files-title">
          <h2 id="files-title">{{ 'handover.attachments' | translate }}</h2>
          <ul class="files">
            @for (file of h!.attachments; track file.path) {
              <li>
                <button type="button" class="link" (click)="open(file.path)">
                  {{ file.name }}
                </button>
              </li>
            }
          </ul>
        </section>
      }
    } @else {
      <sl-empty-state
        [title]="'handover.notYetTitle' | translate"
        [body]="'handover.notYetBody' | translate"
      />
    }

    @if (reminders()?.length) {
      <section slCard class="sl-stack" aria-labelledby="reminders-title">
        <h2 id="reminders-title">{{ 'aftercare.title' | translate }}</h2>
        <ul class="files">
          @for (r of reminders(); track r.id) {
            <li>
              <strong>{{ r.title }}</strong>
              <span class="sl-small"
                >{{ r.dueDate }} · {{ 'aftercare.repeat.' + r.repeat | translate }}</span
              >
            </li>
          }
        </ul>
        <label class="check">
          <input
            type="checkbox"
            [checked]="wantsReminders()"
            (change)="setReminders($any($event.target).checked)"
          />
          {{ 'aftercare.wanted' | translate }}
        </label>
      </section>
    }

    @if (firm()) {
      <section slCard class="sl-stack" aria-labelledby="book-title">
        <h2 id="book-title">{{ 'booking.again' | translate: { firm: firm() } }}</h2>
        <div>
          <button slButton="secondary" type="button" (click)="openBooking(null)">
            {{ 'booking.open' | translate: { firm: firm() } }}
          </button>
        </div>
      </section>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--sl-space-4);
    }
    h2 {
      font: var(--sl-text-section);
    }
    .files {
      display: flex;
      flex-direction: column;
      gap: var(--sl-space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .files li {
      display: flex;
      flex-direction: column;
    }
    .link {
      min-height: var(--sl-target);
      padding: 0;
      border: 0;
      background: none;
      color: var(--sl-accent-text);
      font: 600 15px/20px var(--sl-font-body);
      text-align: left;
      text-decoration: underline;
      cursor: pointer;
    }
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
})
export class ClientHandover {
  private readonly context = inject(ProjectContext);
  private readonly session = inject(Session);
  private readonly media = inject(MediaService);
  private readonly dialogs = inject(Dialogs);
  private readonly firestore = useFirestore();
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);

  /** The reminder behind an aftercare message's "Book again" link. */
  readonly book = input<string>();

  private readonly projectId = computed(() => this.context.projectId() ?? '');
  protected readonly firm = computed(() => this.context.project()?.branding.name ?? '');
  protected readonly handover = liveDoc<Handover>(() =>
    this.projectId() ? `projects/${this.projectId()}/handover/current` : null,
  );
  protected readonly reminders = liveQuery<Reminder>(
    (db, fs) =>
      this.projectId()
        ? fs.query(
            fs.collection(db, 'projects', this.projectId(), 'reminders'),
            fs.where('active', '==', true),
            fs.orderBy('nextSendAt'),
          )
        : null,
    () => this.projectId(),
  );
  private readonly member = liveDoc<ProjectMember>(() => {
    const uid = this.session.user()?.uid;
    return uid && this.projectId() ? `projects/${this.projectId()}/members/${uid}` : null;
  });
  protected readonly wantsReminders = computed(() => this.member()?.notify?.aftercare !== false);

  constructor() {
    // Arriving from a reminder's link opens the booking straight away, once.
    let opened = false;
    effect(() => {
      const reminderId = this.book();
      if (!reminderId || opened || !this.firm()) return;
      opened = true;
      this.openBooking(reminderId);
    });
  }

  protected async open(path: string): Promise<void> {
    window.open(await this.media.url(path), '_blank', 'noopener');
  }

  protected openBooking(reminderId: string | null): void {
    this.dialogs.open<boolean, BookingData, BookingDialog>(BookingDialog, {
      projectId: this.projectId(),
      firm: this.firm(),
      reminderId,
    });
  }

  protected async setReminders(on: boolean): Promise<void> {
    const uid = this.session.user()?.uid;
    const member = this.member();
    if (!uid || !member) return;
    try {
      await this.firestore((db, fs) =>
        fs.updateDoc(fs.doc(db, 'projects', this.projectId(), 'members', uid), {
          notify: { ...member.notify, aftercare: on },
        }),
      );
      this.toasts.show(this.translate.instant('me.saved'), 'success');
    } catch (error) {
      this.toasts.show(this.translate.instant(errorMessageKey(error) ?? 'errors.unknown'), 'error');
    }
  }
}

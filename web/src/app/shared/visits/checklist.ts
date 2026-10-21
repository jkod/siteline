import { Component, computed, inject, input, signal } from '@angular/core';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import type { ChecklistItem, ChecklistSide } from '@siteline/shared';

import { errorMessageKey } from '../../core/errors';
import { liveQuery, useFirestore, type WithId } from '../../core/live';
import { Session } from '../../core/session';
import { DatePipe } from '../pipes/date';
import { Button } from '../ui/button';
import { Toasts } from '../ui/toast';

const UNTICK_WINDOW_MS = 24 * 3600_000;

/** Whether someone may tick or untick an item (PRD F7): clients only their side, unticks within 24 h. */
export function mayToggle(
  item: Pick<ChecklistItem, 'side' | 'doneAt'>,
  mode: 'staff' | 'client',
  nowMs = Date.now(),
): boolean {
  if (mode === 'client' && item.side !== 'client') return false;
  return !item.doneAt || nowMs - item.doneAt.toMillis() < UNTICK_WINDOW_MS;
}

/**
 * The shared checklist for a visit, by side (PRD F7). Anyone on the project adds items for
 * either side; staff tick any item, clients only client items. Ticks record who and when and
 * can be undone within 24 hours.
 */
@Component({
  selector: 'sl-checklist',
  imports: [TranslatePipe, DatePipe, Button],
  templateUrl: './checklist.html',
  styleUrl: './checklist.css',
})
export class Checklist {
  private readonly session = inject(Session);
  private readonly firestore = useFirestore();
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);

  readonly projectId = input.required<string>();
  /** The visit's ID, or null for items waiting for the next booked visit. */
  readonly visitId = input<string | null>(null);
  readonly mode = input.required<'staff' | 'client'>();

  protected readonly sides: ChecklistSide[] = ['client', 'firm'];
  protected readonly text = signal('');
  protected readonly side = signal<ChecklistSide>('client');
  protected readonly adding = signal(false);

  protected readonly items = liveQuery<ChecklistItem>(
    (db, fs) =>
      fs.query(
        fs.collection(db, 'projects', this.projectId(), 'checklist'),
        fs.where('visitId', '==', this.visitId()),
        fs.orderBy('createdAt'),
      ),
    () => [this.projectId(), this.visitId()],
  );
  protected readonly bySide = computed(() => {
    const items = this.items() ?? [];
    return {
      client: items.filter((i) => i.side === 'client'),
      firm: items.filter((i) => i.side === 'firm'),
    };
  });

  protected canTick(item: WithId<ChecklistItem>): boolean {
    return mayToggle(item, this.mode());
  }

  protected async toggle(item: WithId<ChecklistItem>): Promise<void> {
    const name = this.session.profile()?.name ?? '';
    await this.run((db, fs) =>
      fs.updateDoc(
        fs.doc(db, 'projects', this.projectId(), 'checklist', item.id),
        item.doneAt
          ? { doneBy: null, doneByName: null, doneAt: null }
          : { doneBy: this.session.user()!.uid, doneByName: name, doneAt: fs.serverTimestamp() },
      ),
    );
  }

  protected async add(event: Event): Promise<void> {
    event.preventDefault();
    const text = this.text().trim();
    if (!text) return;
    this.adding.set(true);
    await this.run((db, fs) =>
      fs.addDoc(fs.collection(db, 'projects', this.projectId(), 'checklist'), {
        text,
        side: this.side(),
        visitId: this.visitId(),
        createdBy: this.session.user()!.uid,
        createdByName: this.session.profile()?.name ?? '',
        createdAt: fs.serverTimestamp(),
        doneBy: null,
        doneByName: null,
        doneAt: null,
      }),
    );
    this.text.set('');
    this.adding.set(false);
  }

  protected async remove(item: WithId<ChecklistItem>): Promise<void> {
    await this.run((db, fs) =>
      fs.deleteDoc(fs.doc(db, 'projects', this.projectId(), 'checklist', item.id)),
    );
  }

  protected isOwn(item: WithId<ChecklistItem>): boolean {
    return item.createdBy === this.session.user()?.uid && !item.doneAt;
  }

  private async run(action: Parameters<ReturnType<typeof useFirestore>>[0]): Promise<void> {
    try {
      await this.firestore(action);
    } catch (error) {
      const key = errorMessageKey(error);
      if (key) this.toasts.show(this.translate.instant(key), 'error');
    }
  }
}

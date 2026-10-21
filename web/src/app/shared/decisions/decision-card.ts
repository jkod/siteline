import { Component, computed, inject, input, output, signal } from '@angular/core';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { canManageCompany, type Decision } from '@siteline/shared';

import { Api } from '../../core/api';
import { errorMessageKey } from '../../core/errors';
import type { WithId } from '../../core/live';
import { Session } from '../../core/session';
import type { FeedPost } from '../feed/feed-store';
import { DatePipe } from '../pipes/date';
import { MoneyPipe } from '../pipes/money';
import { Button } from '../ui/button';
import { Dialogs } from '../ui/dialog';
import { Icon } from '../ui/icon';
import { Toasts } from '../ui/toast';
import { DecisionEditor, type DecisionEditorData } from './decision-editor';
import { DeclineDialog } from './decline-dialog';

/**
 * A decision card (PRD F6, section 12): a small uppercase label, the title, a price line, and
 * Approve (filled) with Ask a question (outlined). Clients answer; staff send, edit and
 * withdraw. Final states show who decided and when, and can't change.
 */
@Component({
  selector: 'sl-decision-card',
  imports: [Icon, TranslatePipe, MoneyPipe, DatePipe, Button],
  templateUrl: './decision-card.html',
  styleUrl: './decision-card.css',
})
export class DecisionCard {
  private readonly api = inject(Api);
  private readonly session = inject(Session);
  private readonly dialogs = inject(Dialogs);
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);

  readonly post = input.required<WithId<FeedPost> | FeedPost>();
  readonly projectId = input.required<string>();
  readonly viewerIsStaff = input(false);
  /** Opens the comment thread, for "Ask a question". */
  readonly ask = output<void>();

  protected readonly busy = signal(false);
  protected readonly chosen = signal<string | null>(null);
  protected readonly d = computed(() => this.post().decision as Decision);
  protected readonly open = computed(() => this.d().status === 'sent');
  protected readonly isDraft = computed(() => this.d().status === 'draft');
  protected readonly canManage = computed(() => canManageCompany(this.session.role()));
  protected readonly canEditDraft = computed(
    () =>
      this.isDraft() && (this.canManage() || this.d().createdByUid === this.session.user()?.uid),
  );

  protected async approve(): Promise<void> {
    const d = this.d();
    if (d.kind === 'choice' && !this.chosen()) return;
    await this.run(
      () =>
        this.api.respondToDecision({
          projectId: this.projectId(),
          postId: this.post().id,
          version: d.version,
          outcome: d.kind === 'choice' ? 'chosen' : 'approved',
          optionId: this.chosen() ?? undefined,
        }),
      'decisions.answered',
    );
  }

  protected async decline(): Promise<void> {
    const ref = this.dialogs.open<{ reason: string }, void, DeclineDialog>(DeclineDialog);
    const { firstValueFrom } = await import('rxjs');
    const result = await firstValueFrom(ref.closed);
    if (!result) return;
    await this.run(
      () =>
        this.api.respondToDecision({
          projectId: this.projectId(),
          postId: this.post().id,
          version: this.d().version,
          outcome: 'declined',
          reason: result.reason || undefined,
        }),
      'decisions.answered',
    );
  }

  protected edit(): void {
    this.dialogs.open<void, DecisionEditorData, DecisionEditor>(DecisionEditor, {
      projectId: this.projectId(),
      postId: this.post().id,
      decision: this.d(),
      media: this.post().media,
      mode: this.isDraft() ? 'draft' : 'revise',
    });
  }

  protected async send(): Promise<void> {
    await this.run(() => this.api.sendDecision(this.projectId(), this.post().id), 'decisions.sent');
  }

  protected async remove(): Promise<void> {
    if (!(await this.confirm('delete'))) return;
    await this.run(
      () => this.api.deleteDecisionDraft(this.projectId(), this.post().id),
      'decisions.deleted',
    );
  }

  protected async withdraw(): Promise<void> {
    if (!(await this.confirm('withdraw'))) return;
    await this.run(
      () => this.api.withdrawDecision(this.projectId(), this.post().id),
      'decisions.withdrawn',
    );
  }

  private confirm(action: 'delete' | 'withdraw'): Promise<boolean> {
    const t = (key: string) => this.translate.instant(key) as string;
    return this.dialogs.confirm({
      title: t(`decisions.${action}Title`),
      message: t(`decisions.${action}Body`),
      confirmLabel: t(`decisions.${action}Confirm`),
      cancelLabel: t('common.cancel'),
      danger: true,
    });
  }

  private async run(action: () => Promise<unknown>, doneKey: string): Promise<void> {
    this.busy.set(true);
    try {
      await action();
      this.toasts.show(this.translate.instant(doneKey), 'success');
    } catch (error) {
      const key = errorMessageKey(error);
      if (key) this.toasts.show(this.translate.instant(key), 'error');
    } finally {
      this.busy.set(false);
    }
  }
}

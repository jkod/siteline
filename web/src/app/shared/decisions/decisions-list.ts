import { Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { approvedExtraWorkTotal, type Post } from '@siteline/shared';

import { Api } from '../../core/api';
import { errorMessageKey } from '../../core/errors';
import { liveQuery } from '../../core/live';
import type { FeedPost } from '../feed/feed-store';
import { MoneyPipe } from '../pipes/money';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Dialogs } from '../ui/dialog';
import { EmptyState } from '../ui/empty-state';
import { Icon } from '../ui/icon';
import { Toasts } from '../ui/toast';
import { DecisionCard } from './decision-card';
import { DecisionEditor, type DecisionEditorData } from './decision-editor';

/**
 * The Decisions tab (PRD F6): open decisions first, then history, with the total of approved
 * extra work. Staff also create cards and export everything as CSV.
 */
@Component({
  selector: 'sl-decisions-list',
  imports: [Icon, TranslatePipe, MoneyPipe, Button, Card, EmptyState, DecisionCard],
  templateUrl: './decisions-list.html',
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--sl-space-6);
    }
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--sl-space-3);
    }
    .tools {
      display: flex;
      flex-wrap: wrap;
      gap: var(--sl-space-2);
    }
    .total {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: var(--sl-space-3);
    }
    .total strong {
      font: 800 24px/30px var(--sl-font-display);
    }
    ul {
      display: flex;
      flex-direction: column;
      gap: var(--sl-space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
  `,
})
export class DecisionsList {
  private readonly api = inject(Api);
  private readonly dialogs = inject(Dialogs);
  private readonly router = inject(Router);
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);

  readonly projectId = input.required<string>();
  readonly mode = input.required<'staff' | 'client'>();

  protected readonly decisions = liveQuery<Post>(
    (db, fs) => {
      const posts = fs.collection(db, 'projects', this.projectId(), 'posts');
      const filters = [fs.where('type', '==', 'decision')];
      if (this.mode() === 'client') filters.push(fs.where('visibility', '==', 'all'));
      return fs.query(posts, ...filters, fs.orderBy('createdAt', 'desc'));
    },
    () => [this.projectId(), this.mode()],
  );

  protected readonly open = computed(() =>
    (this.decisions() ?? []).filter(
      (p) => p.decision?.status === 'sent' || p.decision?.status === 'draft',
    ),
  );
  protected readonly history = computed(() =>
    (this.decisions() ?? []).filter(
      (p) => p.decision && !['sent', 'draft'].includes(p.decision.status),
    ),
  );
  protected readonly total = computed(() =>
    approvedExtraWorkTotal((this.decisions() ?? []).map((p) => p.decision!).filter(Boolean)),
  );

  protected create(): void {
    this.dialogs.open<string, DecisionEditorData, DecisionEditor>(DecisionEditor, {
      projectId: this.projectId(),
      mode: 'new',
    });
  }

  /** "Ask a question" opens the card in the feed with its comments. */
  protected ask(post: FeedPost): void {
    const base =
      this.mode() === 'staff' ? ['/app/projects', this.projectId()] : ['/c', this.projectId()];
    void this.router.navigate(base, { queryParams: { post: post.id } });
  }

  protected async exportCsv(): Promise<void> {
    try {
      const { csv, filename } = await this.api.exportDecisionsCsv(this.projectId());
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      const key = errorMessageKey(error);
      if (key) this.toasts.show(this.translate.instant(key), 'error');
    }
  }
}

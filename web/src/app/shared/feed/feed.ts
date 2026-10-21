import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  viewChild,
} from '@angular/core';

import { firstValueFrom } from 'rxjs';

import { LucideFlag } from '@lucide/angular';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { errorMessageKey } from '../../core/errors';
import { Session } from '../../core/session';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Dialogs } from '../ui/dialog';
import { EmptyState } from '../ui/empty-state';
import { Toasts } from '../ui/toast';
import { Composer } from './composer';
import { FeedStore } from './feed-store';
import { MilestoneDialog, type MilestoneResult } from './milestone-dialog';
import { PostCard } from './post-card';

/**
 * A project's feed: composer, posts being sent, and posts newest first with infinite scroll
 * and real-time updates (PRD F4). Used by both the staff app and the client view.
 */
@Component({
  selector: 'sl-feed',
  imports: [TranslatePipe, Composer, PostCard, EmptyState, Button, Card, LucideFlag],
  providers: [FeedStore],
  templateUrl: './feed.html',
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--sl-space-4);
    }
    .list {
      display: flex;
      flex-direction: column;
      gap: var(--sl-space-4);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .pending {
      opacity: 0.75;
    }
    .progress {
      height: 6px;
      border-radius: 3px;
      background: var(--sl-panel-2);
      overflow: hidden;
    }
    .progress span {
      display: block;
      height: 100%;
      background: var(--sl-accent);
      transition: width var(--sl-duration) linear;
    }
    .thumbs {
      display: flex;
      gap: var(--sl-space-2);
    }
    .thumbs img {
      width: 56px;
      height: 56px;
      object-fit: cover;
      border-radius: 10px;
    }
    .tools {
      display: flex;
      justify-content: flex-end;
    }
    .more {
      display: flex;
      justify-content: center;
    }
  `,
})
export class Feed {
  protected readonly store = inject(FeedStore);
  private readonly session = inject(Session);
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);
  private readonly dialogs = inject(Dialogs);

  readonly projectId = input.required<string>();
  readonly mode = input.required<'staff' | 'client'>();
  readonly firmName = input('');
  /** A post to open with its comments, from a notification link. */
  readonly focusPostId = input<string | null>(null);

  private readonly sentinel = viewChild<ElementRef<HTMLElement>>('sentinel');
  protected readonly uid = computed(() => this.session.user()?.uid ?? '');
  protected readonly Math = Math;

  constructor() {
    effect(() => void this.store.open(this.projectId()));

    // Load older posts as the end of the list scrolls into view.
    let observer: IntersectionObserver | undefined;
    afterNextRender(() => {
      observer = new IntersectionObserver(
        (entries) => entries.some((e) => e.isIntersecting) && void this.store.loadMore(),
        { rootMargin: '400px' },
      );
      const el = this.sentinel()?.nativeElement;
      if (el) observer.observe(el);
    });
    effect(() => {
      const el = this.sentinel()?.nativeElement;
      observer?.disconnect();
      if (el) observer?.observe(el);
    });
    inject(DestroyRef).onDestroy(() => observer?.disconnect());

    effect(() => {
      const id = this.focusPostId();
      if (id && this.store.posts()?.some((p) => p.id === id)) {
        queueMicrotask(() =>
          document.getElementById(`post-${id}`)?.scrollIntoView({ block: 'center' }),
        );
      }
    });
  }

  protected async edit(postId: string, text: string): Promise<void> {
    await this.run(() => this.store.edit(postId, text));
  }

  protected async remove(postId: string): Promise<void> {
    const t = (key: string) => this.translate.instant(key) as string;
    const confirmed = await this.dialogs.confirm({
      title: t('feed.deletePostTitle'),
      message: t('feed.deletePostBody'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      danger: true,
    });
    if (confirmed) await this.run(() => this.store.remove(postId));
  }

  protected async addMilestone(): Promise<void> {
    const ref = this.dialogs.open<MilestoneResult, void, MilestoneDialog>(MilestoneDialog);
    const result = await firstValueFrom(ref.closed);
    if (!result) return;
    await this.run(() =>
      this.store.publish({
        type: 'milestone',
        text: result.name,
        files: [],
        milestone: { stage: result.stage, stageCount: result.stageCount },
      }),
    );
  }

  protected async resolve(postId: string): Promise<void> {
    await this.run(() => this.store.markResolved(postId));
  }

  private async run(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      const key = errorMessageKey(error);
      if (key) this.toasts.show(this.translate.instant(key), 'error');
    }
  }
}

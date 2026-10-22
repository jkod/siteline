import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  untracked,
  viewChild,
} from '@angular/core';

import { firstValueFrom } from 'rxjs';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import type { FeedStyle } from '@siteline/shared';

import { errorMessageKey } from '../../core/errors';
import { ProjectContext } from '../../core/project-context';
import { Session } from '../../core/session';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Dialogs } from '../ui/dialog';
import { EmptyState } from '../ui/empty-state';
import { ScrollDirection } from '../ui/hide-on-scroll';
import { Icon } from '../ui/icon';
import { Toasts } from '../ui/toast';
import { Composer } from './composer';
import { FeedStore } from './feed-store';
import { MilestoneDialog, type MilestoneResult } from './milestone-dialog';
import { PostCard, type SeenBy } from './post-card';

/** Posts this recent show who has seen them (PRD F16). */
const SEEN_WINDOW_MS = 7 * 86_400_000;

/** How close to the bottom counts as "at the bottom" in chat order, in pixels. */
const NEAR_BOTTOM_PX = 200;

const page = () => document.scrollingElement ?? document.documentElement;
const smooth = (): ScrollBehavior =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

/**
 * A project's feed (PRD F4), in the order the person chose: newest first like a social feed,
 * or newest at the bottom like a chat. In both, the composer stays pinned at the bottom and
 * posts fade as they scroll under it. Used by both the staff app and the client view.
 */
@Component({
  selector: 'sl-feed',
  imports: [Icon, NgTemplateOutlet, TranslatePipe, Composer, PostCard, EmptyState, Button, Card],
  providers: [FeedStore],
  templateUrl: './feed.html',
  styleUrl: './feed.css',
  host: { '[class.chat]': "style() === 'chat'" },
})
export class Feed {
  protected readonly store = inject(FeedStore);
  private readonly session = inject(Session);
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);
  private readonly dialogs = inject(Dialogs);
  private readonly injector = inject(Injector);
  private readonly scrollDirection = inject(ScrollDirection);
  private readonly context = inject(ProjectContext, { optional: true });

  readonly projectId = input.required<string>();
  readonly mode = input.required<'staff' | 'client'>();
  readonly firmName = input('');
  /** A post to open with its comments, from a notification link. */
  readonly focusPostId = input<string | null>(null);

  private readonly sentinel = viewChild<ElementRef<HTMLElement>>('sentinel');
  protected readonly uid = computed(() => this.session.user()?.uid ?? '');
  protected readonly style = computed<FeedStyle>(() => this.session.feedStyle());
  /** Newest first, or oldest first so the newest sits by the composer. */
  protected readonly ordered = computed(() => {
    const posts = this.store.posts() ?? [];
    return this.style() === 'chat' ? [...posts].reverse() : posts;
  });
  protected readonly Math = Math;
  /**
   * For staff: each recent post's clients who have opened the feed since it was posted, from
   * their last-seen time (PRD F16). A client's own question doesn't count.
   */
  protected readonly seenBy = computed(() => {
    const seen = new Map<string, SeenBy[]>();
    if (this.mode() !== 'staff') return seen;
    const clients = (this.context?.clients() ?? []).filter((c) => c.lastSeenAt);
    const since = Date.now() - SEEN_WINDOW_MS;
    for (const post of this.store.posts() ?? []) {
      const posted = post.createdAt?.toMillis();
      if (!posted || posted < since || post.visibility !== 'all') continue;
      const list = clients
        .filter((c) => c.id !== post.authorUid && c.lastSeenAt!.toMillis() >= posted)
        .map((c) => ({ name: c.name, at: c.lastSeenAt! }));
      if (list.length) seen.set(post.id, list);
    }
    return seen;
  });

  /** In chat order, older posts load only once the feed has opened at the bottom. */
  private settled = false;
  private nearBottom = true;
  private newestId: string | null = null;

  constructor() {
    effect(() => {
      this.settled = false;
      this.newestId = null;
      void this.store.open(this.projectId());
    });

    // Load older posts as the "show older" row scrolls into view: below the list in feed order,
    // above it in chat order.
    let observer: IntersectionObserver | undefined;
    afterNextRender(() => {
      observer = new IntersectionObserver(
        (entries) => entries.some((e) => e.isIntersecting) && void this.loadOlder(),
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

    const onScroll = () => {
      const p = page();
      this.nearBottom = p.scrollHeight - (p.scrollTop + window.innerHeight) < NEAR_BOTTOM_PX;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    inject(DestroyRef).onDestroy(() => {
      observer?.disconnect();
      window.removeEventListener('scroll', onScroll);
      this.scrollDirection.reversed.set(false);
    });

    // In chat order, older posts are up, so the top bar hides when scrolling up.
    effect(() => this.scrollDirection.reversed.set(this.style() === 'chat'));

    // Chat order: open at the newest post, and follow new posts when already at the bottom or
    // when they're your own.
    effect(() => {
      const posts = this.store.posts();
      const chat = this.style() === 'chat';
      if (!posts) return;
      const newest = posts[0];
      untracked(() => {
        const isNew = !!newest && newest.id !== this.newestId;
        const first = this.newestId === null;
        this.newestId = newest?.id ?? null;
        if (!chat) {
          this.settled = true;
          return;
        }
        if (first || !this.settled) {
          this.afterRender(() => {
            if (!this.focusPostId()) page().scrollTo({ top: page().scrollHeight });
            this.settled = true;
          });
        } else if (isNew && (this.nearBottom || newest!.authorUid === this.uid())) {
          this.afterRender(() => page().scrollTo({ top: page().scrollHeight, behavior: smooth() }));
        }
      });
    });

    // Switching to chat order jumps to the newest post.
    effect(() => {
      if (this.style() === 'chat') {
        untracked(() => this.afterRender(() => page().scrollTo({ top: page().scrollHeight })));
      }
    });

    effect(() => {
      const id = this.focusPostId();
      if (id && this.store.posts()?.some((p) => p.id === id)) {
        this.afterRender(() =>
          document.getElementById(`post-${id}`)?.scrollIntoView({ block: 'center' }),
        );
      }
    });
  }

  /** Older posts; in chat order they appear above, so the page keeps its place. */
  protected async loadOlder(): Promise<void> {
    if (!this.settled || this.store.loadingMore() || !this.store.hasMore()) return;
    if (this.style() !== 'chat') return this.store.loadMore();
    const p = page();
    const fromBottom = p.scrollHeight - p.scrollTop;
    await this.store.loadMore();
    this.afterRender(() => p.scrollTo({ top: p.scrollHeight - fromBottom }));
  }

  protected async toggleStyle(): Promise<void> {
    await this.run(() => this.session.setFeedStyle(this.style() === 'chat' ? 'feed' : 'chat'));
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

  private afterRender(fn: () => void): void {
    afterNextRender(fn, { injector: this.injector });
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

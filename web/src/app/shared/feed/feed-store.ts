import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';

import type { DocumentSnapshot, Firestore, QueryConstraint } from 'firebase/firestore';
import { FEED_PAGE_SIZE, type Media, type Post } from '@siteline/shared';

import { FirebaseService } from '../../core/firebase';
import type { WithId } from '../../core/live';
import { MediaService } from '../../core/media';
import { Session } from '../../core/session';

export type FeedPost = WithId<Post>;

export interface PendingPost {
  tempId: string;
  type: 'update' | 'question' | 'milestone';
  text: string;
  previews: string[];
  /** 0 to 1 across all photos. */
  progress: number;
  failed: boolean;
}

export interface NewPost {
  type: 'update' | 'question' | 'milestone';
  text: string;
  files: File[];
  milestone?: { stage: number | null; stageCount: number | null };
}

/**
 * One project's feed: the newest 20 posts in real time, older pages on demand (PRD F4), and
 * posts being sent, shown at once in a pending state while their photos upload.
 */
@Injectable()
export class FeedStore {
  private readonly firebase = inject(FirebaseService);
  private readonly media = inject(MediaService);
  private readonly session = inject(Session);

  private projectId = '';
  private unsubscribe?: () => void;
  private lastLive: DocumentSnapshot | null = null;
  private lastOlder: DocumentSnapshot | null = null;

  private readonly live = signal<FeedPost[] | undefined>(undefined);
  private readonly older = signal<FeedPost[]>([]);
  readonly pending = signal<PendingPost[]>([]);
  readonly loadingMore = signal(false);
  readonly hasMore = signal(false);

  readonly posts = computed(() => {
    const live = this.live();
    if (!live) return undefined;
    const seen = new Set(live.map((p) => p.id));
    return [...live, ...this.older().filter((p) => !seen.has(p.id))];
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.unsubscribe?.());
  }

  async open(projectId: string): Promise<void> {
    this.unsubscribe?.();
    this.projectId = projectId;
    this.live.set(undefined);
    this.older.set([]);
    this.lastOlder = null;
    const [db, fs] = await this.load();
    const q = this.feedQuery(db, fs, fs.orderBy('createdAt', 'desc'), fs.limit(FEED_PAGE_SIZE));
    this.unsubscribe = fs.onSnapshot(
      q,
      { includeMetadataChanges: false },
      (snap) => {
        this.live.set(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data({ serverTimestamps: 'estimate' }) as Post),
          })),
        );
        this.lastLive = snap.docs.at(-1) ?? null;
        if (this.older().length === 0) this.hasMore.set(snap.size === FEED_PAGE_SIZE);
      },
      (error) => {
        console.error(error);
        this.live.set([]);
      },
    );
  }

  async loadMore(): Promise<void> {
    const after = this.lastOlder ?? this.lastLive;
    if (!after || this.loadingMore() || !this.hasMore()) return;
    this.loadingMore.set(true);
    try {
      const [db, fs] = await this.load();
      const snap = await fs.getDocs(
        this.feedQuery(
          db,
          fs,
          fs.orderBy('createdAt', 'desc'),
          fs.startAfter(after),
          fs.limit(FEED_PAGE_SIZE),
        ),
      );
      this.older.update((list) => [
        ...list,
        ...snap.docs.map((d) => ({ id: d.id, ...(d.data() as Post) })),
      ]);
      this.lastOlder = snap.docs.at(-1) ?? this.lastOlder;
      this.hasMore.set(snap.size === FEED_PAGE_SIZE);
    } finally {
      this.loadingMore.set(false);
    }
  }

  /** Uploads the photos, then writes the post; the post shows as pending meanwhile. */
  async publish(post: NewPost): Promise<void> {
    const tempId = crypto.randomUUID();
    const previews = post.files.map((f) => URL.createObjectURL(f));
    this.pending.update((list) => [
      { tempId, type: post.type, text: post.text, previews, progress: 0, failed: false },
      ...list,
    ]);
    try {
      const progress = post.files.map(() => 0);
      const media: Media[] = [];
      for (const [i, file] of post.files.entries()) {
        media.push(
          await this.media.upload(this.projectId, file, (fraction) => {
            progress[i] = fraction;
            const total = progress.reduce((a, b) => a + b, 0) / progress.length;
            this.pending.update((list) =>
              list.map((p) => (p.tempId === tempId ? { ...p, progress: total } : p)),
            );
          }),
        );
      }
      const [db, fs] = await this.load();
      const role = this.session.isClient() ? 'client' : this.session.role();
      await fs.addDoc(this.posts$(db, fs), {
        type: post.type,
        authorUid: this.session.user()!.uid,
        authorName: this.session.profile()?.name ?? '',
        authorRole: role,
        text: post.text,
        media,
        visibility: 'all',
        milestone:
          post.type === 'milestone' ? (post.milestone ?? { stage: null, stageCount: null }) : null,
        commentCount: 0,
        unanswered: post.type === 'question',
        createdAt: fs.serverTimestamp(),
        editedAt: null,
        deletedAt: null,
      });
      this.pending.update((list) => list.filter((p) => p.tempId !== tempId));
      previews.forEach((url) => URL.revokeObjectURL(url));
    } catch (error) {
      this.pending.update((list) =>
        list.map((p) => (p.tempId === tempId ? { ...p, failed: true } : p)),
      );
      throw error;
    }
  }

  dismissPending(tempId: string): void {
    const item = this.pending().find((p) => p.tempId === tempId);
    item?.previews.forEach((url) => URL.revokeObjectURL(url));
    this.pending.update((list) => list.filter((p) => p.tempId !== tempId));
  }

  async edit(postId: string, text: string): Promise<void> {
    const [db, fs] = await this.load();
    await fs.updateDoc(fs.doc(this.posts$(db, fs), postId), {
      text,
      editedAt: fs.serverTimestamp(),
    });
  }

  /** Deletes as a marker: "removed by the author" stays in the feed (PRD section 2). */
  async remove(postId: string): Promise<void> {
    const [db, fs] = await this.load();
    await fs.updateDoc(fs.doc(this.posts$(db, fs), postId), {
      text: '',
      media: [],
      unanswered: false,
      deletedAt: fs.serverTimestamp(),
    });
  }

  async markResolved(postId: string): Promise<void> {
    const [db, fs] = await this.load();
    await fs.updateDoc(fs.doc(this.posts$(db, fs), postId), { unanswered: false });
  }

  private posts$(db: Firestore, fs: typeof import('firebase/firestore')) {
    return fs.collection(db, 'projects', this.projectId, 'posts');
  }

  /** Clients may only read posts for everyone, so their queries say so (decision drafts stay hidden). */
  private feedQuery(
    db: Firestore,
    fs: typeof import('firebase/firestore'),
    ...constraints: QueryConstraint[]
  ) {
    const base = this.posts$(db, fs);
    return this.session.isClient()
      ? fs.query(base, fs.where('visibility', '==', 'all'), ...constraints)
      : fs.query(base, ...constraints);
  }

  private load() {
    return Promise.all([this.firebase.firestore(), import('firebase/firestore')]);
  }
}

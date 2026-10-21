import { Component, computed, inject, input, signal } from '@angular/core';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { type Comment, COMMENT_TEXT_MAX } from '@siteline/shared';

import { errorMessageKey } from '../../core/errors';
import { liveQuery, useFirestore } from '../../core/live';
import { Session } from '../../core/session';
import { DatePipe } from '../pipes/date';
import { Avatar } from '../ui/avatar';
import { Button } from '../ui/button';
import { Dialogs } from '../ui/dialog';
import { Toasts } from '../ui/toast';

/** One level of comments under a post, in real time (PRD F4). */
@Component({
  selector: 'sl-comments',
  imports: [TranslatePipe, DatePipe, Avatar, Button],
  templateUrl: './comments.html',
  styleUrl: './comments.css',
})
export class Comments {
  private readonly session = inject(Session);
  private readonly firestore = useFirestore();
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);
  private readonly dialogs = inject(Dialogs);

  readonly projectId = input.required<string>();
  readonly postId = input.required<string>();

  protected readonly maxLength = COMMENT_TEXT_MAX;
  protected readonly uid = computed(() => this.session.user()?.uid);
  protected readonly draft = signal('');
  protected readonly sending = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly editText = signal('');

  protected readonly comments = liveQuery<Comment>(
    (db, fs) =>
      fs.query(
        fs.collection(db, 'projects', this.projectId(), 'posts', this.postId(), 'comments'),
        fs.orderBy('createdAt', 'asc'),
      ),
    () => [this.projectId(), this.postId()],
  );

  protected async send(event: Event): Promise<void> {
    event.preventDefault();
    const text = this.draft().trim();
    if (!text || this.sending()) return;
    this.sending.set(true);
    try {
      await this.firestore((db, fs) =>
        fs.addDoc(
          fs.collection(db, 'projects', this.projectId(), 'posts', this.postId(), 'comments'),
          {
            authorUid: this.uid(),
            authorName: this.session.profile()?.name ?? '',
            authorRole: this.session.isClient() ? 'client' : this.session.role(),
            text,
            media: [],
            createdAt: fs.serverTimestamp(),
            editedAt: null,
            deletedAt: null,
          },
        ),
      );
      this.draft.set('');
    } catch (error) {
      this.showError(error);
    } finally {
      this.sending.set(false);
    }
  }

  protected startEdit(id: string, text: string): void {
    this.editingId.set(id);
    this.editText.set(text);
  }

  protected async saveEdit(id: string): Promise<void> {
    const text = this.editText().trim();
    if (!text) return;
    try {
      await this.firestore((db, fs) =>
        fs.updateDoc(
          fs.doc(db, 'projects', this.projectId(), 'posts', this.postId(), 'comments', id),
          {
            text,
            editedAt: fs.serverTimestamp(),
          },
        ),
      );
      this.editingId.set(null);
    } catch (error) {
      this.showError(error);
    }
  }

  protected async remove(id: string): Promise<void> {
    const t = (key: string) => this.translate.instant(key) as string;
    const confirmed = await this.dialogs.confirm({
      title: t('feed.deleteCommentTitle'),
      message: t('feed.deleteCommentBody'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await this.firestore((db, fs) =>
        fs.updateDoc(
          fs.doc(db, 'projects', this.projectId(), 'posts', this.postId(), 'comments', id),
          {
            text: '',
            media: [],
            deletedAt: fs.serverTimestamp(),
          },
        ),
      );
    } catch (error) {
      this.showError(error);
    }
  }

  private showError(error: unknown): void {
    const key = errorMessageKey(error);
    if (key) this.toasts.show(this.translate.instant(key), 'error');
  }
}

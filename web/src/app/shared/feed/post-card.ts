import { Component, computed, inject, input, output, signal } from '@angular/core';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { isStaffRole, POST_TEXT_MAX, type TimestampLike } from '@siteline/shared';

import { Language } from '../../core/language';
import { DecisionCard } from '../decisions/decision-card';
import { DatePipe, formatDate } from '../pipes/date';
import { PluralPipe } from '../pipes/plural';
import { Avatar } from '../ui/avatar';
import { Button } from '../ui/button';
import { Icon } from '../ui/icon';
import { Comments } from './comments';
import type { FeedPost } from './feed-store';
import { PhotoGrid } from './photo-grid';

export interface SeenBy {
  name: string;
  at: TimestampLike;
}

/** One feed item, with a variant per post type (PRD section 11). */
@Component({
  selector: 'sl-post-card',
  imports: [
    Icon,
    TranslatePipe,
    DatePipe,
    PluralPipe,
    Avatar,
    Button,
    PhotoGrid,
    Comments,
    DecisionCard,
  ],
  templateUrl: './post-card.html',
  styleUrl: './post-card.css',
  host: { '[attr.id]': '"post-" + post().id' },
})
export class PostCard {
  private readonly translate = inject(TranslateService);
  private readonly language = inject(Language);

  readonly post = input.required<FeedPost>();
  readonly projectId = input.required<string>();
  readonly viewerUid = input.required<string>();
  readonly viewerIsStaff = input(false);
  readonly firmName = input('');
  readonly expanded = input(false);
  /** Clients who have opened the feed since this post, for staff (PRD F16). */
  readonly seenBy = input<SeenBy[]>([]);

  readonly edit = output<string>();
  readonly remove = output<void>();
  readonly resolve = output<void>();

  protected readonly maxLength = POST_TEXT_MAX;
  protected readonly showComments = signal(false);
  protected readonly editing = signal(false);
  protected readonly editText = signal('');

  protected readonly isOwn = computed(() => this.post().authorUid === this.viewerUid());
  /** Decisions and reports are written by functions only; their authors can't edit them here. */
  protected readonly editable = computed(() =>
    ['update', 'milestone', 'question'].includes(this.post().type),
  );
  protected readonly isDeleted = computed(() => this.post().deletedAt != null);
  /** "Anna 18:42, Bo tis 4 nov. 09:10", first names only. */
  protected readonly seenLine = computed(() =>
    this.seenBy()
      .map((s) => `${s.name.split(/\s+/)[0]} ${formatDate(s.at, 'seen', this.language.lang())}`)
      .join(', '),
  );
  protected readonly commentsOpen = computed(() => this.showComments() || this.expanded());
  protected readonly authorIsStaff = computed(() => isStaffRole(this.post().authorRole));
  protected readonly roleLabel = computed(() =>
    this.authorIsStaff() ? this.firmName() : this.translate.instant('feed.roleClient'),
  );
  /** Alt text: the caption, or "Photo from {firm}, {date}" (PRD section 13). */
  protected readonly photoAlt = computed(() => {
    const post = this.post();
    if (post.text) return post.text.slice(0, 120);
    return this.translate.instant('feed.photoAlt', {
      firm: this.authorIsStaff() ? this.firmName() : post.authorName,
      date: formatDate(post.createdAt, 'date', this.language.lang()),
    });
  });

  protected startEdit(): void {
    this.editText.set(this.post().text);
    this.editing.set(true);
  }

  protected saveEdit(): void {
    const text = this.editText().trim();
    if (!text && this.post().media.length === 0) return;
    this.edit.emit(text);
    this.editing.set(false);
  }
}

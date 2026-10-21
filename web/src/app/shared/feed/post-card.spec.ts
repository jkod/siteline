import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { provideTestTranslations, setTestTranslations } from '../../../testing/translate';
import type { FeedPost } from './feed-store';
import { PostCard } from './post-card';

const ts = (iso: string) => ({ toMillis: () => Date.parse(iso), toDate: () => new Date(iso) });

function post(overrides: Partial<FeedPost> = {}): FeedPost {
  return {
    id: 'p1',
    type: 'update',
    authorUid: 'erik',
    authorName: 'Erik Ek',
    authorRole: 'owner',
    text: 'Rivningen är klar.',
    media: [],
    visibility: 'all',
    milestone: null,
    commentCount: 0,
    unanswered: false,
    createdAt: ts('2026-10-21T10:00:00Z'),
    editedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

@Component({
  imports: [PostCard],
  template: `
    <sl-post-card
      [post]="post()"
      projectId="proj"
      [viewerUid]="viewer()"
      [viewerIsStaff]="staff()"
      firmName="Ek & Lind"
      (resolve)="resolved = true"
      (remove)="removed = true"
    />
  `,
})
class Host {
  readonly post = signal(post());
  readonly viewer = signal('anna');
  readonly staff = signal(false);
  resolved = false;
  removed = false;
}

describe('PostCard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestTranslations() });
    setTestTranslations({
      feed: {
        question: 'Fråga',
        unanswered: 'Obesvarad',
        markResolved: 'Markera som besvarad',
        removedByAuthor: 'Borttaget av författaren',
        edited: 'redigerad',
        stageOf: 'Etapp {{stage}} av {{count}}',
        roleClient: 'Kund',
        comment: 'Kommentera',
        commentCount: { one: '{{count}} kommentar', other: '{{count}} kommentarer' },
      },
      common: { edit: 'Redigera', delete: 'Ta bort' },
    });
  });

  async function render(setup: (host: Host) => void = () => undefined) {
    const fixture = TestBed.createComponent(Host);
    setup(fixture.componentInstance);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('shows the author, the firm as their role, and the text', async () => {
    const { el } = await render();
    expect(el.textContent).toContain('Erik Ek');
    expect(el.textContent).toContain('Ek & Lind');
    expect(el.textContent).toContain('Rivningen är klar.');
    expect(el.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-21T10:00:00.000Z');
  });

  it('shows staff an unanswered badge and a resolve button on client questions', async () => {
    const { fixture, el } = await render((h) => {
      h.post.set(
        post({
          type: 'question',
          authorUid: 'anna',
          authorName: 'Anna',
          authorRole: 'client',
          unanswered: true,
        }),
      );
      h.staff.set(true);
      h.viewer.set('erik');
    });
    expect(el.textContent).toContain('Fråga');
    expect(el.textContent).toContain('Obesvarad');
    const resolve = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Markera som besvarad'),
    )!;
    resolve.click();
    expect(fixture.componentInstance.resolved).toBe(true);
  });

  it('hides the badge from clients', async () => {
    const { el } = await render((h) =>
      h.post.set(post({ type: 'question', authorRole: 'client', unanswered: true })),
    );
    expect(el.textContent).not.toContain('Obesvarad');
  });

  it('shows a milestone stage on a dark card', async () => {
    const { el } = await render((h) =>
      h.post.set(
        post({ type: 'milestone', text: 'VVS klart', milestone: { stage: 3, stageCount: 4 } }),
      ),
    );
    expect(el.querySelector('.card')?.classList).toContain('milestone');
    expect(el.textContent).toContain('Etapp 3 av 4');
    expect(el.textContent).toContain('VVS klart');
  });

  it('leaves a "removed by the author" marker for deleted posts', async () => {
    const { el } = await render((h) =>
      h.post.set(post({ text: '', deletedAt: ts('2026-10-21T11:00:00Z') })),
    );
    expect(el.textContent).toContain('Borttaget av författaren');
    expect(el.textContent).not.toContain('Redigera');
  });

  it('marks edited posts and offers edit and delete only to the author', async () => {
    const own = await render((h) => {
      h.post.set(post({ editedAt: ts('2026-10-21T10:05:00Z') }));
      h.viewer.set('erik');
    });
    expect(own.el.textContent).toContain('redigerad');
    expect(own.el.textContent).toContain('Redigera');
    const remove = [...own.el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Ta bort'),
    )!;
    remove.click();
    expect(own.fixture.componentInstance.removed).toBe(true);

    const other = await render();
    expect(other.el.textContent).not.toContain('Redigera');
  });

  it('uses plural forms for the comment count', async () => {
    const one = await render((h) => h.post.set(post({ commentCount: 1 })));
    expect(one.el.textContent).toContain('1 kommentar');
    const many = await render((h) => h.post.set(post({ commentCount: 3 })));
    expect(many.el.textContent).toContain('3 kommentarer');
    const none = await render();
    expect(none.el.textContent).toContain('Kommentera');
  });
});

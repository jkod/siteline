import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import type { Decision } from '@siteline/shared';

import { provideTestTranslations, setTestTranslations } from '../../../testing/translate';
import { Api } from '../../core/api';
import { Session } from '../../core/session';
import type { FeedPost } from '../feed/feed-store';
import { DecisionCard } from './decision-card';

const ts = (iso: string) => ({ toMillis: () => Date.parse(iso), toDate: () => new Date(iso) });

function post(decision: Partial<Decision>): FeedPost {
  return {
    id: 'd1',
    type: 'decision',
    authorUid: 'erik',
    authorName: 'Erik Ek',
    authorRole: 'owner',
    text: '',
    media: [],
    visibility: 'all',
    milestone: null,
    commentCount: 0,
    unanswered: false,
    createdAt: ts('2026-10-03T16:00:00Z'),
    editedAt: null,
    deletedAt: null,
    decision: {
      kind: 'extra_work',
      title: 'Byt rutten golvbjälke',
      priceOre: 650_000,
      vatRate: 0.25,
      status: 'sent',
      version: 1,
      createdByUid: 'erik',
      ...decision,
    },
  };
}

@Component({
  imports: [DecisionCard],
  template: `<sl-decision-card
    [post]="post()"
    projectId="p1"
    [viewerIsStaff]="staff()"
    (ask)="asked = true"
  />`,
})
class Host {
  readonly post = signal(post({}));
  readonly staff = signal(false);
  asked = false;
}

describe('DecisionCard', () => {
  const respond = vi.fn().mockResolvedValue({ approvalId: 'a1' });

  beforeEach(() => {
    respond.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideTestTranslations(),
        { provide: Api, useValue: { respondToDecision: respond } },
        { provide: Session, useValue: { role: () => 'owner', user: () => ({ uid: 'erik' }) } },
      ],
    });
    setTestTranslations({
      decisions: {
        kind: { extra_work: 'Tilläggsarbete', choice: 'Val', approval: 'Godkännande' },
        status: { draft: 'Utkast' },
        approve: 'Godkänn',
        choose: 'Välj',
        ask: 'Ställ en fråga',
        decline: 'Avböj',
        send: 'Skicka till kunden',
        revise: 'Ändra',
        withdraw: 'Dra tillbaka',
        answered: 'Tack!',
        outcome: {
          approved: 'Godkänt av {{name}}, {{date}}',
          superseded: 'Ersatt av en ny version',
        },
      },
      common: { edit: 'Redigera', delete: 'Ta bort' },
    });
  });

  async function render(setup: (h: Host) => void = () => undefined) {
    const fixture = TestBed.createComponent(Host);
    setup(fixture.componentInstance);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const button = (name: string) =>
      [...el.querySelectorAll('button')].find((b) => b.textContent?.trim().includes(name));
    return { fixture, el, button };
  }

  it('shows the label, title, price and the client actions (PRD section 12)', async () => {
    const { el, button } = await render();
    expect(el.textContent).toContain('Tilläggsarbete');
    expect(el.textContent).toContain('Byt rutten golvbjälke');
    expect(el.textContent?.replace(/\u00a0/g, ' ')).toContain('6 500 kr');
    expect(button('Godkänn')).toBeTruthy();
    expect(button('Ställ en fråga')).toBeTruthy();
  });

  it('approves the version on screen', async () => {
    const { fixture, button } = await render();
    button('Godkänn')!.click();
    await fixture.whenStable();
    expect(respond).toHaveBeenCalledWith({
      projectId: 'p1',
      postId: 'd1',
      version: 1,
      outcome: 'approved',
      optionId: undefined,
    });
  });

  it('opens the comments for "Ask a question"', async () => {
    const { fixture, button } = await render();
    button('Ställ en fråga')!.click();
    expect(fixture.componentInstance.asked).toBe(true);
  });

  it('needs an option before a choice can be sent', async () => {
    const { button, el, fixture } = await render((h) =>
      h.post.set(
        post({
          kind: 'choice',
          priceOre: undefined,
          options: [
            { id: 'a', label: 'Ek' },
            { id: 'b', label: 'Komposit', priceDeltaOre: 350_000 },
          ],
        }),
      ),
    );
    expect((button('Välj') as HTMLButtonElement).disabled).toBe(true);
    (el.querySelectorAll('input[type=radio]')[1] as HTMLInputElement).click();
    await fixture.whenStable();
    expect((button('Välj') as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows who approved and when, with no actions, once final', async () => {
    const { el, button } = await render((h) =>
      h.post.set(
        post({
          status: 'approved',
          decidedByName: 'Anna Lindqvist',
          decidedAt: ts('2026-10-03T16:42:00Z'),
        }),
      ),
    );
    expect(el.textContent).toMatch(/Godkänt av Anna Lindqvist, 3 okt\.? 2026,? 18:42/);
    expect(button('Godkänn')).toBeUndefined();
  });

  it('gives staff send, edit and delete on drafts, and change and withdraw once sent', async () => {
    const draft = await render((h) => {
      h.staff.set(true);
      h.post.set(post({ status: 'draft' }));
    });
    expect(draft.el.textContent).toContain('Utkast');
    expect(draft.button('Skicka till kunden')).toBeTruthy();
    expect(draft.button('Ta bort')).toBeTruthy();
    expect(draft.button('Godkänn')).toBeUndefined();

    const sent = await render((h) => h.staff.set(true));
    expect(sent.button('Ändra')).toBeTruthy();
    expect(sent.button('Dra tillbaka')).toBeTruthy();
  });
});

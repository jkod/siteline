import { Component, computed, effect, ElementRef, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TranslatePipe } from '@ngx-translate/core';
import type { Project, ProjectMember } from '@siteline/shared';

import { liveQuery, useFirestore, type WithId } from '../core/live';
import { Session } from '../core/session';
import { Brand } from '../shared/ui/brand';
import { Icon } from '../shared/ui/icon';

/**
 * The firm's name in the client's top bar, which opens a list of all the client's projects from
 * every firm when there is more than one (the user's request), with a dot on those with news.
 * Escape or a click elsewhere closes it.
 */
@Component({
  selector: 'sl-project-switcher',
  imports: [TranslatePipe, RouterLink, Brand, Icon],
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close(true)',
  },
  template: `
    @let p = current();
    @if (others().length) {
      <button
        #toggle
        type="button"
        class="toggle"
        aria-controls="project-menu"
        [attr.aria-expanded]="open()"
        [attr.aria-label]="'switcher.label' | translate: { firm: p.branding.name }"
        (click)="toggleMenu()"
      >
        <span class="firm">{{ p.branding.name }}</span>
        <sl-icon name="keyboard_arrow_down" [size]="22" />
      </button>
      @if (open()) {
        <nav id="project-menu" class="menu" [attr.aria-label]="'switcher.menu' | translate">
          <ul>
            @for (project of projects(); track project.id) {
              <li [slBrand]="project.branding.accentColor">
                <a
                  [routerLink]="['/c', project.id]"
                  [attr.aria-current]="project.id === p.id ? 'page' : null"
                  (click)="close(false)"
                >
                  <span class="mark" aria-hidden="true">{{ project.branding.name[0] }}</span>
                  <span class="text">
                    <span class="name">{{ project.branding.name }}</span>
                    <span class="title">{{ project.title }}</span>
                  </span>
                  @if (unread().has(project.id)) {
                    <span class="dot"></span>
                    <span class="sl-visually-hidden">{{ 'switcher.news' | translate }}</span>
                  }
                </a>
              </li>
            }
            <li>
              <a routerLink="/c" class="all" (click)="close(false)">
                {{ 'client.allProjects' | translate }}
              </a>
            </li>
          </ul>
        </nav>
      }
    } @else {
      <span class="firm">{{ p.branding.name }}</span>
    }
  `,
  styles: `
    /* The menu hangs from the top bar (the nearest positioned box), so it fits on any screen. */
    :host {
      min-width: 0;
    }
    .firm {
      font: 800 18px/24px var(--sl-font-display);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .toggle {
      display: flex;
      align-items: center;
      gap: var(--sl-space-1);
      max-width: 100%;
      min-height: var(--sl-target);
      padding: 0 var(--sl-space-2);
      margin-left: calc(-1 * var(--sl-space-2));
      border: 0;
      border-radius: var(--sl-radius-pill);
      background: none;
      color: var(--sl-text);
      cursor: pointer;
    }
    .toggle:hover {
      background: var(--sl-panel);
    }
    .menu {
      position: absolute;
      top: calc(100% + var(--sl-space-1));
      left: var(--sl-space-3);
      right: var(--sl-space-3);
      z-index: 30;
      max-width: 400px;
      padding: var(--sl-space-2);
      background: var(--sl-surface);
      border: 1px solid var(--sl-border);
      border-radius: var(--sl-radius-card);
      box-shadow: var(--sl-shadow-raised);
    }
    ul {
      display: flex;
      flex-direction: column;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    a {
      display: flex;
      align-items: center;
      gap: var(--sl-space-3);
      min-height: var(--sl-target);
      padding: var(--sl-space-2) var(--sl-space-3);
      border-radius: var(--sl-radius-panel);
      color: var(--sl-text);
      text-decoration: none;
    }
    a:hover,
    a[aria-current='page'] {
      background: var(--sl-panel);
    }
    .mark {
      flex: none;
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: var(--sl-accent);
      color: var(--sl-on-accent);
      font: 800 15px/1 var(--sl-font-display);
    }
    .text {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-width: 0;
    }
    .name {
      font: var(--sl-text-small);
      color: var(--sl-accent-text);
      font-weight: 600;
    }
    .title {
      font-weight: 600;
    }
    .dot {
      flex: none;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--sl-alert);
    }
    .all {
      justify-content: center;
      font-weight: 600;
      color: var(--sl-accent-text);
    }
  `,
})
export class ProjectSwitcher {
  private readonly session = inject(Session);
  private readonly firestore = useFirestore();
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;

  readonly current = input.required<WithId<Project>>();
  protected readonly open = signal(false);
  /** Projects with posts since the client last looked. */
  protected readonly unread = signal(new Set<string>());

  protected readonly projects = liveQuery<Project>(
    (db, fs) => {
      const uid = this.session.user()?.uid;
      return uid
        ? fs.query(
            fs.collection(db, 'projects'),
            fs.where('clientUids', 'array-contains', uid),
            fs.orderBy('lastPostAt', 'desc'),
          )
        : null;
    },
    () => this.session.user()?.uid,
  );
  protected readonly others = computed(() =>
    (this.projects() ?? []).filter((p) => p.id !== this.current().id),
  );

  constructor() {
    // Moving to another project closes the menu.
    effect(() => {
      this.current();
      this.open.set(false);
    });
  }

  protected toggleMenu(): void {
    this.open.update((open) => !open);
    if (this.open()) void this.loadUnread();
  }

  protected close(returnFocus: boolean): void {
    if (!this.open()) return;
    this.open.set(false);
    if (returnFocus) this.host.querySelector<HTMLElement>('.toggle')?.focus();
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (!this.host.contains(event.target as Node)) this.close(false);
  }

  private async loadUnread(): Promise<void> {
    const uid = this.session.user()?.uid;
    if (!uid) return;
    const projects = this.others();
    const seen = await this.firestore((db, fs) =>
      Promise.all(
        projects.map((p) =>
          fs
            .getDoc(fs.doc(db, 'projects', p.id, 'members', uid))
            .then((d) => (d.data() as ProjectMember | undefined)?.lastSeenAt?.toMillis() ?? 0)
            .catch(() => Number.MAX_SAFE_INTEGER),
        ),
      ),
    );
    this.unread.set(
      new Set(
        projects.filter((p, i) => (p.lastPostAt?.toMillis() ?? 0) > seen[i]!).map((p) => p.id),
      ),
    );
  }
}

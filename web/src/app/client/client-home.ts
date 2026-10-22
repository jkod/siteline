import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { TranslatePipe } from '@ngx-translate/core';
import type { Project } from '@siteline/shared';

import { liveQuery } from '../core/live';
import { Session } from '../core/session';
import { DatePipe } from '../shared/pipes/date';
import { Brand } from '../shared/ui/brand';
import { EmptyState } from '../shared/ui/empty-state';
import { InviteCard } from './invite-card';

/**
 * Every project and service from every firm the client uses, on one screen (PRD F3), and the
 * card for inviting other businesses (F20).
 */
@Component({
  selector: 'sl-client-home',
  imports: [TranslatePipe, RouterLink, DatePipe, Brand, EmptyState, InviteCard],
  template: `
    <main class="sl-page sl-stack" id="main">
      <div class="title-row">
        <h1>{{ 'clientHome.greeting' | translate: { name: firstName() } }}</h1>
        <a routerLink="/c/settings">{{ 'pages.clientSettings' | translate }}</a>
      </div>
      @if (projects(); as list) {
        @if (list.length) {
          <ul class="projects">
            @for (project of list; track project.id) {
              <li [slBrand]="project.branding.accentColor">
                <a [routerLink]="['/c', project.id]" class="project">
                  @if (project.branding.logoUrl) {
                    <img [src]="project.branding.logoUrl" alt="" width="44" height="44" />
                  } @else {
                    <span class="mark" aria-hidden="true">{{ project.branding.name[0] }}</span>
                  }
                  <span class="text">
                    <span class="firm">{{ project.branding.name }}</span>
                    <span class="title">{{ project.title }}</span>
                    <span class="sl-small">
                      @if (project.lastPostAt) {
                        {{
                          'staffHome.lastPost'
                            | translate: { when: (project.lastPostAt | slDate: 'relative') }
                        }}
                      } @else {
                        {{ 'staffHome.noPosts' | translate }}
                      }
                    </span>
                  </span>
                </a>
              </li>
            }
          </ul>
          <sl-invite-card
            [projectId]="list[0]!.id"
            [companyId]="list[0]!.companyId"
            [focus]="inviteLink"
          />
        } @else {
          <sl-empty-state
            [title]="'clientHome.emptyTitle' | translate"
            [body]="'clientHome.emptyBody' | translate"
          />
        }
      }
    </main>
  `,
  styles: `
    .title-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--sl-space-3);
    }
    .title-row a {
      display: inline-flex;
      align-items: center;
      min-height: var(--sl-target);
      font-weight: 600;
    }
    .projects {
      display: flex;
      flex-direction: column;
      gap: var(--sl-space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .project {
      display: flex;
      gap: var(--sl-space-4);
      align-items: center;
      padding: var(--sl-space-4);
      background: var(--sl-surface);
      border: 1px solid var(--sl-border);
      border-left: 6px solid var(--sl-accent);
      border-radius: var(--sl-radius-card);
      color: inherit;
      text-decoration: none;
    }
    img,
    .mark {
      flex: none;
      width: 44px;
      height: 44px;
      border-radius: 12px;
      object-fit: contain;
    }
    .mark {
      display: grid;
      place-items: center;
      background: var(--sl-accent);
      color: var(--sl-on-accent);
      font: 800 20px/1 var(--sl-font-display);
    }
    .text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .firm {
      font: 600 14px/18px var(--sl-font-body);
      color: var(--sl-accent-text);
    }
    .title {
      font: 700 18px/24px var(--sl-font-display);
    }
  `,
})
export class ClientHome {
  private readonly session = inject(Session);
  /** Arrived from the invite link in the digest (F20). */
  protected readonly inviteLink = inject(ActivatedRoute).snapshot.queryParamMap.has('invite');
  protected readonly firstName = computed(
    () => (this.session.profile()?.name ?? '').split(' ')[0] ?? '',
  );
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
}

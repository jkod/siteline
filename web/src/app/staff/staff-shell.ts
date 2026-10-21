import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { LucideLogOut } from '@lucide/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { canManageCompany } from '@siteline/shared';

import { Session } from '../core/session';
import { Button } from '../shared/ui/button';
import { CurrentCompany } from './current-company';

/**
 * Frame for the staff app. M1 adds the project list as a left sidebar on desktop and a bottom
 * tab bar inside projects on mobile (PRD section 11).
 */
@Component({
  selector: 'sl-staff-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe, LucideLogOut, Button],
  template: `
    <header class="bar">
      <a class="company" routerLink="/app">{{ company.name() || 'Siteline' }}</a>
      <nav [attr.aria-label]="'staff.nav' | translate">
        <a
          routerLink="/app"
          routerLinkActive="active"
          [routerLinkActiveOptions]="{ exact: true }"
          ariaCurrentWhenActive="page"
        >
          {{ 'pages.staffHome' | translate }}
        </a>
        @if (canManage()) {
          <a
            routerLink="/app/settings/company"
            routerLinkActive="active"
            ariaCurrentWhenActive="page"
          >
            {{ 'pages.settingsCompany' | translate }}
          </a>
        }
        <a routerLink="/app/settings/me" routerLinkActive="active" ariaCurrentWhenActive="page">
          {{ 'pages.settingsMe' | translate }}
        </a>
      </nav>
      <button
        slButton="ghost"
        icon
        type="button"
        [attr.aria-label]="'common.signOut' | translate"
        (click)="signOut()"
      >
        <svg lucideLogOut [size]="20"></svg>
      </button>
    </header>
    <router-outlet />
  `,
  styles: `
    .bar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      gap: var(--sl-space-4);
      padding: var(--sl-space-2) var(--sl-space-4);
      background: color-mix(in srgb, var(--sl-bg) 92%, transparent);
      backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--sl-border);
    }
    .company {
      font: 800 18px/24px var(--sl-font-display);
      color: var(--sl-text);
      text-decoration: none;
    }
    .company {
      flex: 1;
    }
    nav {
      display: flex;
      gap: var(--sl-space-1);
      overflow-x: auto;
    }
    @media (max-width: 640px) {
      .bar {
        flex-wrap: wrap;
        row-gap: 0;
      }
      nav {
        order: 3;
        flex-basis: 100%;
      }
    }
    nav a {
      display: flex;
      align-items: center;
      min-height: var(--sl-target);
      padding: 0 var(--sl-space-3);
      border-radius: var(--sl-radius-pill);
      color: var(--sl-text-2);
      font-weight: 600;
      text-decoration: none;
      white-space: nowrap;
    }
    nav a.active {
      background: var(--sl-accent-tint);
      color: var(--sl-accent-text);
    }
  `,
})
export class StaffShell {
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  protected readonly company = inject(CurrentCompany);
  protected readonly canManage = computed(() => canManageCompany(this.session.role()));

  protected async signOut(): Promise<void> {
    await this.session.signOut();
    await this.router.navigateByUrl('/login');
  }
}

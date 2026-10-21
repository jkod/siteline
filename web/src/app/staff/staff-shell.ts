import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { TranslatePipe } from '@ngx-translate/core';
import { canManageCompany } from '@siteline/shared';

import { Session } from '../core/session';
import { PluralPipe } from '../shared/pipes/plural';
import { Brand } from '../shared/ui/brand';
import { Button } from '../shared/ui/button';
import { HideOnScroll } from '../shared/ui/hide-on-scroll';
import { Icon } from '../shared/ui/icon';
import { CurrentCompany } from './current-company';

/**
 * Frame for the staff app: a sidebar with the menu and active projects on desktop, and a top
 * bar on phones (PRD section 11). The firm's colour themes the staff app too.
 */
@Component({
  selector: 'sl-staff-shell',
  imports: [
    Icon,
    PluralPipe,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    TranslatePipe,
    Button,
    Brand,
    HideOnScroll,
  ],
  templateUrl: './staff-shell.html',
  styleUrl: './staff-shell.css',
})
export class StaffShell {
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  protected readonly company = inject(CurrentCompany);

  protected readonly canManage = computed(() => canManageCompany(this.session.role()));
  protected readonly isOwner = computed(() => this.session.role() === 'owner');
  protected readonly links = computed(() => [
    { path: '/app', label: 'staffHome.title', exact: true },
    ...(this.canManage()
      ? [
          { path: '/app/settings/team', label: 'pages.settingsTeam', exact: false },
          { path: '/app/settings/company', label: 'pages.settingsCompany', exact: false },
        ]
      : []),
    ...(this.isOwner()
      ? [{ path: '/app/settings/billing', label: 'pages.settingsBilling', exact: false }]
      : []),
    { path: '/app/settings/me', label: 'pages.settingsMe', exact: false },
  ]);

  protected async signOut(): Promise<void> {
    await this.session.signOut();
    await this.router.navigateByUrl('/login');
  }
}

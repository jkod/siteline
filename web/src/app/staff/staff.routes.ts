import type { Routes } from '@angular/router';

import { roleGuard } from '../core/guards';
import { placeholder } from '../shared/ui/placeholder-page';
import { StaffShell } from './staff-shell';

const managers = { canActivate: [roleGuard('owner', 'admin')] };

export const STAFF_ROUTES: Routes = [
  {
    path: '',
    component: StaffShell,
    children: [
      placeholder('', 'pages.staffHome', { pathMatch: 'full' }),
      placeholder('projects/new', 'pages.newProject', managers),
      placeholder('clients/new', 'pages.newClient', managers),
      {
        path: 'projects/:projectId',
        children: [
          placeholder('', 'pages.projectFeed', { pathMatch: 'full' }),
          placeholder('decisions', 'pages.decisions'),
          placeholder('visit', 'pages.visit'),
          placeholder('handover', 'pages.handover', managers),
          placeholder('people', 'pages.people'),
        ],
      },
      placeholder('settings/company', 'pages.settingsCompany', managers),
      placeholder('settings/team', 'pages.settingsTeam', managers),
      placeholder('settings/billing', 'pages.settingsBilling', {
        canActivate: [roleGuard('owner')],
      }),
      placeholder('settings/me', 'pages.settingsMe'),
    ],
  },
];

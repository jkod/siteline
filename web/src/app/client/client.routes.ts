import type { Routes } from '@angular/router';

import { clientProjectGuard } from '../core/guards';
import { placeholder } from '../shared/ui/placeholder-page';
import { ClientShell } from './client-shell';

export const CLIENT_ROUTES: Routes = [
  {
    path: '',
    component: ClientShell,
    children: [
      placeholder('', 'pages.clientHome', { pathMatch: 'full' }),
      placeholder('settings', 'pages.clientSettings'),
      {
        path: ':projectId',
        canActivate: [clientProjectGuard],
        children: [
          placeholder('', 'pages.projectFeed', { pathMatch: 'full' }),
          placeholder('decisions', 'pages.decisions'),
          placeholder('visit', 'pages.visit'),
          placeholder('handover', 'pages.handover'),
        ],
      },
    ],
  },
];

import type { Routes } from '@angular/router';

import { clientProjectGuard } from '../core/guards';
import { ClientShell } from './client-shell';

export const CLIENT_ROUTES: Routes = [
  {
    path: '',
    component: ClientShell,
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'pages.clientHome',
        loadComponent: () => import('./client-home').then((m) => m.ClientHome),
      },
      {
        path: 'settings',
        title: 'pages.clientSettings',
        loadComponent: () => import('./client-settings').then((m) => m.ClientSettings),
      },
      {
        path: ':projectId',
        canActivate: [clientProjectGuard],
        loadComponent: () => import('./client-project-shell').then((m) => m.ClientProjectShell),
        children: [
          {
            path: '',
            pathMatch: 'full',
            title: 'pages.projectFeed',
            loadComponent: () => import('./client-feed').then((m) => m.ClientFeed),
          },
          {
            path: 'decisions',
            title: 'pages.decisions',
            loadComponent: () => import('./client-decisions').then((m) => m.ClientDecisions),
          },
          {
            path: 'visit',
            title: 'pages.visit',
            loadComponent: () => import('./client-visits').then((m) => m.ClientVisits),
          },
          {
            path: 'handover',
            title: 'pages.handover',
            loadComponent: () => import('./client-handover').then((m) => m.ClientHandover),
          },
        ],
      },
    ],
  },
];

import type { Routes } from '@angular/router';

import { clientProjectGuard } from '../core/guards';
import { placeholder } from '../shared/ui/placeholder-page';
import { ClientShell } from './client-shell';

const tab = (titleKey: string, bodyKey: string) => ({
  loadComponent: () =>
    import('../staff/project/project-tab-placeholder').then((m) => m.ProjectTabPlaceholder),
  data: { titleKey, bodyKey },
});

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
      placeholder('settings', 'pages.clientSettings'),
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
            ...tab('placeholders.clientDecisionsTitle', 'placeholders.clientDecisionsBody'),
          },
          {
            path: 'visit',
            title: 'pages.visit',
            ...tab('placeholders.clientVisitTitle', 'placeholders.clientVisitBody'),
          },
        ],
      },
    ],
  },
];

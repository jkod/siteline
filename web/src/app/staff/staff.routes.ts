import type { Routes } from '@angular/router';

import { roleGuard } from '../core/guards';
import { StaffShell } from './staff-shell';

const managers = { canActivate: [roleGuard('owner', 'admin')] };

export const STAFF_ROUTES: Routes = [
  {
    path: '',
    component: StaffShell,
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'staffHome.title',
        loadComponent: () => import('./home').then((m) => m.StaffHome),
      },
      {
        path: 'projects/new',
        title: 'pages.newProject',
        ...managers,
        loadComponent: () => import('./new-project').then((m) => m.NewProject),
      },
      {
        path: 'clients/new',
        title: 'pages.newClient',
        ...managers,
        loadComponent: () => import('./new-service-client').then((m) => m.NewServiceClient),
      },
      {
        path: 'projects/:projectId',
        loadComponent: () => import('./project/project-shell').then((m) => m.ProjectShell),
        children: [
          {
            path: '',
            pathMatch: 'full',
            title: 'pages.projectFeed',
            loadComponent: () => import('./project/project-feed').then((m) => m.ProjectFeed),
          },
          {
            path: 'decisions',
            title: 'pages.decisions',
            loadComponent: () =>
              import('./project/project-decisions').then((m) => m.ProjectDecisions),
          },
          {
            path: 'visit',
            title: 'pages.visit',
            loadComponent: () => import('./project/project-visits').then((m) => m.ProjectVisits),
          },
          {
            path: 'people',
            title: 'pages.people',
            loadComponent: () => import('./project/project-people').then((m) => m.ProjectPeople),
          },
          {
            path: 'handover',
            title: 'pages.handover',
            ...managers,
            loadComponent: () =>
              import('./project/project-handover').then((m) => m.ProjectHandover),
          },
        ],
      },
      {
        path: 'settings/company',
        title: 'pages.settingsCompany',
        ...managers,
        loadComponent: () => import('./settings/company-settings').then((m) => m.CompanySettings),
      },
      {
        path: 'settings/team',
        title: 'pages.settingsTeam',
        ...managers,
        loadComponent: () => import('./settings/team-settings').then((m) => m.TeamSettings),
      },
      {
        path: 'settings/billing',
        title: 'pages.settingsBilling',
        canActivate: [roleGuard('owner')],
        loadComponent: () => import('./settings/billing-settings').then((m) => m.BillingSettings),
      },
      {
        path: 'settings/me',
        title: 'pages.settingsMe',
        loadComponent: () => import('./settings/me-settings').then((m) => m.MeSettings),
      },
    ],
  },
];

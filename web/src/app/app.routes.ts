import type { Routes } from '@angular/router';

import { clientGuard, homeRedirect, onboardingGuard, staffGuard } from './core/guards';
import { DEV_ROUTES } from './dev/dev.routes';
import { placeholder } from './shared/ui/placeholder-page';

// The staff app (/app) and the client view (/c) are separate lazy areas, so the client view
// stays small (PRD section 11).
export const routes: Routes = [
  { path: '', pathMatch: 'full', canActivate: [homeRedirect], children: [] },
  { path: 'login', loadChildren: () => import('./auth/auth.routes').then((m) => m.AUTH_ROUTES) },
  {
    path: 'onboarding',
    canActivate: [onboardingGuard],
    loadComponent: () => import('./auth/onboarding').then((m) => m.Onboarding),
    title: 'pages.onboarding',
  },
  {
    path: 'app',
    canMatch: [staffGuard],
    loadChildren: () => import('./staff/staff.routes').then((m) => m.STAFF_ROUTES),
  },
  {
    path: 'c',
    canMatch: [clientGuard],
    loadChildren: () => import('./client/client.routes').then((m) => m.CLIENT_ROUTES),
  },
  placeholder('p/:token', 'pages.redeem'),
  placeholder('link-expired', 'pages.linkExpired'),
  placeholder('r/:code', 'pages.referral'),
  placeholder('legal/privacy', 'pages.privacy'),
  placeholder('legal/terms', 'pages.terms'),
  ...DEV_ROUTES,
  placeholder('**', 'pages.notFound'),
];

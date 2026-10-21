import type { Routes } from '@angular/router';

export const AUTH_ROUTES: Routes = [
  { path: '', title: 'pages.login', loadComponent: () => import('./login').then((m) => m.Login) },
  {
    path: 'finish',
    title: 'pages.loginFinish',
    loadComponent: () => import('./login-finish').then((m) => m.LoginFinish),
  },
];

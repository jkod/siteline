import type { Routes } from '@angular/router';

import { environment } from '../../environments/environment';
import { emulatorGuard } from '../core/guards';

// Development pages, only in emulator builds. Production builds swap this file for
// dev.routes.prod.ts (angular.json), so none of this code ships.
export const DEV_ROUTES: Routes = [
  {
    path: 'dev',
    canMatch: [emulatorGuard(environment.emulators)],
    children: [
      {
        path: 'outbox',
        title: 'pages.devOutbox',
        loadComponent: () => import('./outbox').then((m) => m.Outbox),
      },
      {
        path: 'ui',
        title: 'pages.devUi',
        loadComponent: () => import('./ui-gallery').then((m) => m.UiGallery),
      },
    ],
  },
];

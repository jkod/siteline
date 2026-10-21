import type { AppEnvironment } from './environment.model';

// Local development against the Firebase Emulator Suite. The demo- project ID means the
// emulators can never touch a real project.
export const environment: AppEnvironment = {
  emulators: true,
  firebase: {
    apiKey: 'demo-api-key',
    authDomain: 'demo-siteline.firebaseapp.com',
    projectId: 'demo-siteline',
    storageBucket: 'demo-siteline.appspot.com',
    appId: 'demo-app',
    messagingSenderId: '',
  },
  appCheckSiteKey: '',
  release: 'dev',
};

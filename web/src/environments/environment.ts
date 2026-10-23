import { type AppEnvironment, DEV_EMULATOR_HOSTS } from './environment.model';

// Production. Staging has its own file (environment.staging.ts). Fill in from the Firebase
// console once the project exists, as docs/STAGING.md describes; nothing is deployed until then.
export const environment: AppEnvironment = {
  emulators: false,
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: 'siteline-prod',
    storageBucket: '',
    appId: '',
    messagingSenderId: '',
  },
  appCheckSiteKey: '',
  vapidKey: '',
  release: '0.0.0',
  emulatorHosts: DEV_EMULATOR_HOSTS,
};

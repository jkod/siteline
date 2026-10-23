import { type AppEnvironment, DEV_EMULATOR_HOSTS } from './environment.model';

// Staging, built with `ng build siteline --configuration staging`. Fill in from the Firebase
// console (Project settings → Your apps → Web app), as docs/STAGING.md describes.
export const environment: AppEnvironment = {
  emulators: false,
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: 'siteline-staging',
    storageBucket: '',
    appId: '',
    messagingSenderId: '',
  },
  appCheckSiteKey: '',
  vapidKey: '',
  release: 'staging',
  emulatorHosts: DEV_EMULATOR_HOSTS,
};

import { type AppEnvironment, DEV_EMULATOR_HOSTS } from './environment.model';

// Production and staging. Fill in the web app config once the Firebase projects exist
// (PRD section 15); until then nothing here is used, because nothing is deployed.
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
  release: '0.0.0',
  emulatorHosts: DEV_EMULATOR_HOSTS,
};

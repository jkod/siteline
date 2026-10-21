import type { AppEnvironment } from './environment.model';

// End-to-end tests: the test emulators from firebase.test.json, so they can run next to
// `npm run dev`.
export const environment: AppEnvironment = {
  emulators: true,
  firebase: {
    apiKey: 'demo-api-key',
    authDomain: 'demo-siteline-test.firebaseapp.com',
    projectId: 'demo-siteline-test',
    storageBucket: 'demo-siteline-test.appspot.com',
    appId: 'demo-app',
    messagingSenderId: '',
  },
  appCheckSiteKey: '',
  release: 'e2e',
  emulatorHosts: {
    auth: 'http://127.0.0.1:9189',
    firestore: { host: '127.0.0.1', port: 8180 },
    storage: { host: '127.0.0.1', port: 9289 },
    functions: { host: '127.0.0.1', port: 5101 },
  },
};

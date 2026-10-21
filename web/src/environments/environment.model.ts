import type { FirebaseOptions } from 'firebase/app';

export interface AppEnvironment {
  /** Connect to the local Emulator Suite and enable the /dev pages. */
  emulators: boolean;
  firebase: FirebaseOptions;
  /** reCAPTCHA Enterprise site key for App Check; App Check stays off while empty. */
  appCheckSiteKey: string;
  release: string;
}

export const EMULATOR_HOSTS = {
  auth: 'http://127.0.0.1:9099',
  firestore: { host: '127.0.0.1', port: 8080 },
  storage: { host: '127.0.0.1', port: 9199 },
  functions: { host: '127.0.0.1', port: 5001 },
} as const;

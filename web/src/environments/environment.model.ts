import type { FirebaseOptions } from 'firebase/app';

export interface AppEnvironment {
  /** Connect to the local Emulator Suite and enable the /dev pages. */
  emulators: boolean;
  firebase: FirebaseOptions;
  /** reCAPTCHA Enterprise site key for App Check; App Check stays off while empty. */
  appCheckSiteKey: string;
  /** Use an App Check debug token, for running a local build against staging. */
  appCheckDebug?: boolean;
  /** The web push VAPID key from Firebase Cloud Messaging; browser notifications stay off while empty. */
  vapidKey?: string;
  release: string;
  /** Emulator addresses: the dev ports, or the test ports from firebase.test.json for e2e. */
  emulatorHosts: EmulatorHosts;
}

export interface EmulatorHosts {
  auth: string;
  firestore: { host: string; port: number };
  storage: { host: string; port: number };
  functions: { host: string; port: number };
}

export const DEV_EMULATOR_HOSTS: EmulatorHosts = {
  auth: 'http://127.0.0.1:9099',
  firestore: { host: '127.0.0.1', port: 8080 },
  storage: { host: '127.0.0.1', port: 9199 },
  functions: { host: '127.0.0.1', port: 5001 },
};

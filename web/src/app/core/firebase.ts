import { Injectable } from '@angular/core';

import { initializeApp } from 'firebase/app';
import {
  type Auth,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  connectAuthEmulator,
  indexedDBLocalPersistence,
  initializeAuth,
} from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { Functions } from 'firebase/functions';
import type { FirebaseStorage } from 'firebase/storage';
import { REGION } from '@siteline/shared';

import { environment } from '../../environments/environment';

/**
 * Owns the Firebase app. Auth starts eagerly because guards need it on the first navigation;
 * Firestore, Functions and Storage load on first use, which keeps them out of the initial bundle.
 */
@Injectable({ providedIn: 'root' })
export class FirebaseService {
  readonly app = initializeApp(environment.firebase);
  readonly auth: Auth = this.createAuth();

  private firestorePromise?: Promise<Firestore>;
  private functionsPromise?: Promise<Functions>;
  private storagePromise?: Promise<FirebaseStorage>;

  constructor() {
    if (environment.appCheckSiteKey) {
      void this.startAppCheck(environment.appCheckSiteKey);
    }
  }

  firestore(): Promise<Firestore> {
    return (this.firestorePromise ??= import('firebase/firestore').then((m) => {
      const db = m.initializeFirestore(this.app, {});
      if (environment.emulators) {
        m.connectFirestoreEmulator(
          db,
          environment.emulatorHosts.firestore.host,
          environment.emulatorHosts.firestore.port,
        );
      }
      return db;
    }));
  }

  functions(): Promise<Functions> {
    return (this.functionsPromise ??= import('firebase/functions').then((m) => {
      const functions = m.getFunctions(this.app, REGION);
      if (environment.emulators) {
        m.connectFunctionsEmulator(
          functions,
          environment.emulatorHosts.functions.host,
          environment.emulatorHosts.functions.port,
        );
      }
      return functions;
    }));
  }

  storage(): Promise<FirebaseStorage> {
    return (this.storagePromise ??= import('firebase/storage').then((m) => {
      const storage = m.getStorage(this.app);
      if (environment.emulators) {
        m.connectStorageEmulator(
          storage,
          environment.emulatorHosts.storage.host,
          environment.emulatorHosts.storage.port,
        );
      }
      return storage;
    }));
  }

  /** Calls a callable function by name. */
  async call<Req, Res>(name: string, data: Req): Promise<Res> {
    const [functions, { httpsCallable }] = await Promise.all([
      this.functions(),
      import('firebase/functions'),
    ]);
    const result = await httpsCallable<Req, Res>(functions, name)(data);
    return result.data;
  }

  private createAuth(): Auth {
    const auth = initializeAuth(this.app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
    if (environment.emulators) {
      connectAuthEmulator(auth, environment.emulatorHosts.auth, { disableWarnings: true });
    }
    return auth;
  }

  private async startAppCheck(siteKey: string): Promise<void> {
    const { initializeAppCheck, ReCaptchaEnterpriseProvider } = await import('firebase/app-check');
    initializeAppCheck(this.app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }
}

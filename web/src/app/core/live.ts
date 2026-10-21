import { effect, inject, type Signal, signal } from '@angular/core';

import type { DocumentData, Firestore, Query } from 'firebase/firestore';

import { FirebaseService } from './firebase';

export type WithId<T> = T & { id: string };

type FirestoreModule = typeof import('firebase/firestore');

/**
 * A Firestore document as a signal, updated in real time. `undefined` while loading and `null`
 * when the path is null, the document is missing or the rules deny it. Call in an injection
 * context; the listener follows `path` and stops on destroy.
 */
export function liveDoc<T>(path: () => string | null): Signal<WithId<T> | null | undefined> {
  const firebase = inject(FirebaseService);
  const value = signal<WithId<T> | null | undefined>(undefined);
  effect((onCleanup) => {
    const p = path();
    if (!p) {
      value.set(null);
      return;
    }
    value.set(undefined);
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    void Promise.all([firebase.firestore(), import('firebase/firestore')]).then(([db, fs]) => {
      if (cancelled) return;
      unsubscribe = fs.onSnapshot(
        fs.doc(db, p),
        (snap) =>
          value.set(
            snap.exists()
              ? ({
                  id: snap.id,
                  ...(snap.data({ serverTimestamps: 'estimate' }) as T),
                } as WithId<T>)
              : null,
          ),
        () => value.set(null),
      );
    });
    onCleanup(() => {
      cancelled = true;
      unsubscribe?.();
    });
  });
  return value.asReadonly();
}

/**
 * A Firestore query as a signal, updated in real time. `build` returns null to skip, for example
 * until the session is known. `undefined` while loading.
 */
export function liveQuery<T>(
  build: (db: Firestore, fs: FirestoreModule) => Query<DocumentData> | null,
  deps: () => unknown,
): Signal<WithId<T>[] | undefined> {
  const firebase = inject(FirebaseService);
  const value = signal<WithId<T>[] | undefined>(undefined);
  effect((onCleanup) => {
    deps();
    value.set(undefined);
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    void Promise.all([firebase.firestore(), import('firebase/firestore')]).then(([db, fs]) => {
      if (cancelled) return;
      const query = build(db, fs);
      if (!query) {
        value.set([]);
        return;
      }
      unsubscribe = fs.onSnapshot(
        query,
        // Pending server timestamps read as estimates, so new items sort and show a time at once.
        (snap) =>
          value.set(
            snap.docs.map((d) => ({
              id: d.id,
              ...(d.data({ serverTimestamps: 'estimate' }) as T),
            })),
          ),
        (error) => {
          console.error(error);
          value.set([]);
        },
      );
    });
    onCleanup(() => {
      cancelled = true;
      unsubscribe?.();
    });
  });
  return value.asReadonly();
}

/** Runs a function with the Firestore instance and module, loaded on first use. */
export function useFirestore() {
  const firebase = inject(FirebaseService);
  return async <R>(fn: (db: Firestore, fs: FirestoreModule) => Promise<R>): Promise<R> => {
    const [db, fs] = await Promise.all([firebase.firestore(), import('firebase/firestore')]);
    return fn(db, fs);
  };
}

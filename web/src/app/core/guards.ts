import { inject } from '@angular/core';
import { type CanActivateFn, type CanMatchFn, Router } from '@angular/router';

import { type StaffRole } from '@siteline/shared';

import { FirebaseService } from './firebase';
import { homeUrl } from './home-url';
import { Session } from './session';

// Every guard injects before its first await: inject() only works synchronously.

/** Sends the root URL to the right area for the signed-in person (PRD section 11). */
export const homeRedirect: CanActivateFn = async () => {
  const session = inject(Session);
  const router = inject(Router);
  await session.ready;
  return router.parseUrl(homeUrl(session.signedIn(), session.claims()));
};

/** Staff only: the claims include a company (`cid`). */
export const staffGuard: CanMatchFn = async (_route, segments) => {
  const session = inject(Session);
  const router = inject(Router);
  await session.ready;
  if (session.isStaff()) return true;
  if (!session.signedIn()) {
    const returnUrl = `/${segments.map((s) => s.path).join('/')}`;
    return router.createUrlTree(['/login'], { queryParams: { returnUrl } });
  }
  return router.parseUrl(homeUrl(true, session.claims()));
};

/** Staff with one of the given roles; others go back to the staff home. */
export function roleGuard(...roles: StaffRole[]): CanActivateFn {
  return async () => {
    const session = inject(Session);
    const router = inject(Router);
    await session.ready;
    const role = session.role();
    return (role != null && roles.includes(role)) || router.parseUrl('/app');
  };
}

/** Signed-in people without a company yet: the onboarding flow. */
export const onboardingGuard: CanActivateFn = async () => {
  const session = inject(Session);
  const router = inject(Router);
  await session.ready;
  if (session.signedIn() && !session.isStaff() && !session.isClient()) return true;
  return router.parseUrl(homeUrl(session.signedIn(), session.claims()));
};

/** Clients signed in through an invite link. Without a session, they need a new link. */
export const clientGuard: CanMatchFn = async () => {
  const session = inject(Session);
  const router = inject(Router);
  await session.ready;
  if (session.isClient()) return true;
  return session.signedIn()
    ? router.parseUrl(homeUrl(true, session.claims()))
    : router.parseUrl('/link-expired');
};

/**
 * A client's project page: security rules allow reading the project only to its members, so
 * a successful read is the membership check.
 */
export const clientProjectGuard: CanActivateFn = async (route) => {
  const firebase = inject(FirebaseService);
  const router = inject(Router);
  const projectId = route.paramMap.get('projectId');
  if (!projectId) return router.parseUrl('/c');
  try {
    const [db, { doc, getDoc }] = await Promise.all([
      firebase.firestore(),
      import('firebase/firestore'),
    ]);
    const snapshot = await getDoc(doc(db, 'projects', projectId));
    return snapshot.exists() || router.parseUrl('/c');
  } catch {
    return router.parseUrl('/c');
  }
};

/** The /dev pages exist only when the app talks to the emulators. */
export function emulatorGuard(emulators: boolean): CanMatchFn {
  return () => emulators;
}

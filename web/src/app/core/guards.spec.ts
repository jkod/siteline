import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  type ActivatedRouteSnapshot,
  provideRouter,
  Router,
  type RouterStateSnapshot,
  type UrlSegment,
  UrlTree,
} from '@angular/router';

import type { StaffRole } from '@siteline/shared';

import { clientGuard, homeRedirect, onboardingGuard, roleGuard, staffGuard } from './guards';
import { Session, type SessionClaims } from './session';

function fakeSession(signedIn: boolean, claims: Partial<SessionClaims> = {}) {
  const full: SessionClaims = { cid: null, crole: null, isClient: false, isDemo: false, ...claims };
  return {
    ready: Promise.resolve(),
    signedIn: signal(signedIn),
    claims: signal(full),
    isStaff: signal(full.cid != null),
    isClient: signal(full.isClient),
    role: signal<StaffRole | null>(full.crole),
  };
}

function setup(session: ReturnType<typeof fakeSession>) {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: Session, useValue: session }],
  });
}

const route = {} as ActivatedRouteSnapshot;
const state = {} as RouterStateSnapshot;
// canMatch guards get a partial route snapshot as a third argument; these guards don't read it.
const snapshot = undefined as never;
const segments = (path: string) => path.split('/').map((p) => ({ path: p }) as UrlSegment);

async function run(guard: () => unknown): Promise<string | true> {
  const result = await TestBed.runInInjectionContext(guard);
  if (result instanceof UrlTree) return TestBed.inject(Router).serializeUrl(result);
  return result as true;
}

describe('guards', () => {
  it('homeRedirect sends people to their area', async () => {
    setup(fakeSession(true, { cid: 'c1', crole: 'owner' }));
    expect(await run(() => homeRedirect(route, state))).toBe('/app');
  });

  it('staffGuard lets staff in and sends signed-out people to login with a return URL', async () => {
    setup(fakeSession(false));
    expect(await run(() => staffGuard({}, segments('app/settings/me'), snapshot))).toBe(
      '/login?returnUrl=%2Fapp%2Fsettings%2Fme',
    );
  });

  it('staffGuard sends signed-in people without a company to onboarding', async () => {
    setup(fakeSession(true));
    expect(await run(() => staffGuard({}, segments('app'), snapshot))).toBe('/onboarding');
  });

  it('staffGuard admits staff', async () => {
    setup(fakeSession(true, { cid: 'c1', crole: 'crew' }));
    expect(await run(() => staffGuard({}, segments('app'), snapshot))).toBe(true);
  });

  it('roleGuard admits listed roles and sends others to the staff home', async () => {
    setup(fakeSession(true, { cid: 'c1', crole: 'crew' }));
    expect(await run(() => roleGuard('owner', 'admin')(route, state))).toBe('/app');
    expect(await run(() => roleGuard('crew')(route, state))).toBe(true);
  });

  it('onboardingGuard only admits signed-in people without a company', async () => {
    setup(fakeSession(true, { cid: 'c1', crole: 'owner' }));
    expect(await run(() => onboardingGuard(route, state))).toBe('/app');
  });

  it('clientGuard admits clients and sends signed-out people to the link page', async () => {
    setup(fakeSession(false));
    expect(await run(() => clientGuard({}, [], snapshot))).toBe('/link-expired');
  });

  it('clientGuard admits clients', async () => {
    setup(fakeSession(true, { isClient: true }));
    expect(await run(() => clientGuard({}, [], snapshot))).toBe(true);
  });
});

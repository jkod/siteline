import type { SessionClaims } from './session';

/** Where a person belongs after signing in, or when opening the app's root. */
export function homeUrl(signedIn: boolean, claims: SessionClaims): string {
  if (!signedIn) return '/login';
  if (claims.cid) return '/app';
  if (claims.isClient) return '/c';
  return '/onboarding';
}

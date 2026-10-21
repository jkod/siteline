import type { Auth } from 'firebase-admin/auth';
import { type StaffClaims, staffClaimsSchema } from '@siteline/shared';

/**
 * Sets the staff claims (`cid`, `crole`) on a user, keeping any other claims. The app refreshes
 * its ID token after a change (PRD F1).
 */
export async function setStaffClaims(auth: Auth, uid: string, claims: StaffClaims): Promise<void> {
  const parsed = staffClaimsSchema.parse(claims);
  const user = await auth.getUser(uid);
  await auth.setCustomUserClaims(uid, { ...user.customClaims, ...parsed });
}

/** Removes the staff claims from a user, keeping any other claims. */
export async function clearStaffClaims(auth: Auth, uid: string): Promise<void> {
  const user = await auth.getUser(uid);
  const rest = { ...user.customClaims };
  delete rest['cid'];
  delete rest['crole'];
  await auth.setCustomUserClaims(uid, rest);
}

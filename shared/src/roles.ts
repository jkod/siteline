export const STAFF_ROLES = ['owner', 'admin', 'crew'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const PROJECT_ROLES = ['client', 'crew'] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

/** Custom claims set on staff accounts by functions (PRD F1). */
export interface StaffClaims {
  cid: string;
  crole: StaffRole;
}

/** Developer claims on the custom token minted for clients by `redeemInvite`. */
export interface ClientClaims {
  kind: 'client';
}

export function isStaffRole(value: unknown): value is StaffRole {
  return STAFF_ROLES.includes(value as StaffRole);
}

export function canManageCompany(role: StaffRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

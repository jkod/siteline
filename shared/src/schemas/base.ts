import { z } from 'zod';

import type { ClientError } from '../client-error';
import { normalizePhone } from '../phone';
import { PLANS } from '../plans';
import { PROJECT_ROLES, STAFF_ROLES, type StaffClaims } from '../roles';

// zod schemas live apart from the plain helpers: a schema built at module level can't be
// tree-shaken, so keeping them here keeps zod out of bundles that only need the helpers.

export const staffRoleSchema = z.enum(STAFF_ROLES);
export const projectRoleSchema = z.enum(PROJECT_ROLES);
export const planSchema = z.enum(PLANS);

export const staffClaimsSchema: z.ZodType<StaffClaims> = z.object({
  cid: z.string().min(1),
  crole: staffRoleSchema,
});

export const clientClaimsSchema = z.object({
  kind: z.literal('client'),
});

export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** A phone number as typed, normalised to E.164 with +46 as the default country code. */
export const phoneSchema = z.string().transform((value, ctx) => {
  const normalized = normalizePhone(value);
  if (!normalized) {
    ctx.addIssue({ code: 'custom', message: 'invalid_phone' });
    return z.NEVER;
  }
  return normalized;
});

export const clientErrorSchema: z.ZodType<ClientError> = z.object({
  name: z.string().max(100).optional(),
  message: z.string().max(500),
  stack: z.string().max(4000).optional(),
  path: z.string().max(500),
  release: z.string().max(50).optional(),
});

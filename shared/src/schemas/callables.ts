import { z } from 'zod';

import { LOCALES } from '../constants';
import { NAME_MAX, TITLE_MAX } from '../limits';
import { isValidOrgNumber } from '../org-number';
import { hexColorSchema, phoneSchema } from './base';

// Inputs for the callable functions (PRD section 9). The web app validates forms with the same
// schemas before calling.

const name = z.string().trim().min(1).max(NAME_MAX);
const id = z.string().min(1).max(128);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalEmail = z
  .string()
  .trim()
  .transform((v) => v || null)
  .pipe(z.email().nullable());

export const orgNumberSchema = z
  .string()
  .trim()
  .transform((v) => v || null)
  .refine((v) => v === null || isValidOrgNumber(v), { message: 'invalid_org_number' });

export const addressSchema = z.object({
  street: z.string().trim().max(120),
  postalCode: z.string().trim().max(10),
  city: z.string().trim().max(60),
});

export const createCompanyInput = z.object({
  name: z.string().trim().min(1).max(80),
  orgNumber: orgNumberSchema.optional().default(''),
  accentColor: hexColorSchema,
  locale: z.enum(LOCALES),
  ownerName: name,
  referralCode: z.string().max(64).optional(),
});
export type CreateCompanyInput = z.input<typeof createCompanyInput>;

export const inviteStaffInput = z
  .object({
    name,
    email: optionalEmail.optional().default(''),
    phone: z.string().trim().optional().default(''),
    role: z.enum(['admin', 'crew']),
  })
  .transform((v, ctx) => {
    const phone = v.phone ? phoneSchema.safeParse(v.phone) : null;
    if (phone && !phone.success) {
      ctx.addIssue({ code: 'custom', path: ['phone'], message: 'invalid_phone' });
      return z.NEVER;
    }
    if (!v.email && !phone) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: 'email_or_phone_required' });
      return z.NEVER;
    }
    return { ...v, phone: phone?.success ? phone.data : null };
  });
export type InviteStaffInput = z.input<typeof inviteStaffInput>;

export const tokenInput = z.object({ token: z.string().min(20).max(128) });

export const setStaffRoleInput = z.object({ uid: id, role: z.enum(['owner', 'admin', 'crew']) });
export const removeStaffInput = z.object({ uid: id });

export const createProjectInput = z
  .object({
    kind: z.enum(['project', 'service']).default('project'),
    title: z.string().trim().min(1).max(TITLE_MAX),
    address: addressSchema.nullable().default(null),
    startDate: isoDate.nullable().default(null),
    endDate: isoDate.nullable().default(null),
    crewUids: z.array(id).max(50).default([]),
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, {
    path: ['endDate'],
    message: 'end_before_start',
  });
export type CreateProjectInput = z.input<typeof createProjectInput>;

export const setProjectStatusInput = z.object({
  projectId: id,
  status: z.enum(['active', 'completed', 'archived']),
});

export const assignCrewInput = z.object({ projectId: id, crewUids: z.array(id).max(50) });

export const inviteClientInput = z.object({
  projectId: id,
  name,
  phone: phoneSchema,
  email: optionalEmail.optional().default(''),
});
export type InviteClientInput = z.input<typeof inviteClientInput>;

export const projectMemberInput = z.object({ projectId: id, uid: id });

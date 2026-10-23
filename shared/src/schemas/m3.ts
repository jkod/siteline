import { z } from 'zod';

import { BUSINESS_KINDS } from '../model';

const id = z.string().min(1).max(128);

// Inputs for the M3 callables: voice drafts and client invites (PRD section 9).

export const voiceDraftInput = z.object({
  projectId: id,
  audioId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  format: z.enum(['webm', 'm4a', 'ogg']),
});
export type VoiceDraftInput = z.input<typeof voiceDraftInput>;

export const discardVoiceDraftInput = voiceDraftInput.pick({ projectId: true, audioId: true });

export const createReferralInput = z.object({
  projectId: id,
  businessKind: z.enum(BUSINESS_KINDS),
  showFirstName: z.boolean(),
});
export type CreateReferralInput = z.input<typeof createReferralInput>;

export const openReferralInput = z.object({ code: z.string().regex(/^[A-Za-z0-9]{6,32}$/) });

export const startDemoInput = z.object({
  kind: z.enum(['firm', 'client']),
  locale: z.enum(['sv', 'en']).default('sv'),
});
export type StartDemoInput = z.input<typeof startDemoInput>;

/** A mobile number or an email address, for a client's sign-in link. */
export const emailSchema = z.email().max(120);

export const clientSignInInput = z.object({ contact: z.string().trim().min(3).max(120) });

export const setApprovalRuleInput = z.object({
  projectId: id,
  rule: z.enum(['any', 'all']),
});

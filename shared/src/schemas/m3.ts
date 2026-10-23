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

export const checkoutInput = z.object({
  plan: z.enum(['visits', 'solo', 'team', 'pro']),
  interval: z.enum(['month', 'year']),
});

/** The emulator's /dev/billing page: plays a Stripe event for the caller's company. */
export const devBillingInput = z.object({
  action: z.enum(['pay', 'change', 'fail', 'cancel']),
  plan: z.enum(['visits', 'solo', 'team', 'pro']).optional(),
  interval: z.enum(['month', 'year']).optional(),
});

/** Deleting a project needs its name typed again (PRD F11). */
export const deleteProjectInput = z.object({ projectId: id, title: z.string().max(200) });
export const projectOnlyInput = z.object({ projectId: id });

const media = z.object({
  path: z.string().max(300),
  thumbPath: z.string().max(300),
  width: z.number().int(),
  height: z.number().int(),
  tags: z.array(z.enum(['before', 'after', 'hidden_work', 'condition'])).max(4),
});

/** The handover editor (PRD F9). */
export const saveHandoverInput = z.object({
  projectId: id,
  summary: z.string().trim().max(5000),
  beforeAfter: z
    .array(z.object({ before: media, after: media, caption: z.string().trim().max(200) }))
    .max(20),
  materials: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        brand: z.string().trim().max(120),
        colourCode: z.string().trim().max(60),
        supplier: z.string().trim().max(120),
        warrantyYears: z.number().int().min(0).max(50).nullable(),
      }),
    )
    .max(100),
  careNotes: z.string().trim().max(5000),
  attachments: z
    .array(
      z.object({
        path: z.string().max(300),
        name: z.string().max(200),
        size: z
          .number()
          .int()
          .min(0)
          .max(20 * 1024 * 1024),
        contentType: z.string().max(100),
      }),
    )
    .max(30),
});
export type SaveHandoverInput = z.input<typeof saveHandoverInput>;

/** A condition check-in (F12): photos with a note and a place each. */
export const postConditionInput = z.object({
  projectId: id,
  text: z.string().trim().max(2000).default(''),
  media: z.array(media).min(1).max(20),
  items: z
    .array(
      z.object({
        mediaIndex: z.number().int().min(0).max(19),
        note: z.string().trim().min(1).max(300),
        location: z.string().trim().max(120).default(''),
      }),
    )
    .min(1)
    .max(20),
});
export type PostConditionInput = z.input<typeof postConditionInput>;

export const postRefInput = z.object({ projectId: id, postId: id });

export const saveReminderInput = z.object({
  projectId: id,
  reminderId: id.optional(),
  title: z.string().trim().min(1).max(120),
  note: z.string().trim().max(1000).default(''),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  repeat: z.enum(['none', 'yearly']),
});
export type SaveReminderInput = z.input<typeof saveReminderInput>;

export const reminderRefInput = z.object({ projectId: id, reminderId: id });

export const requestBookingInput = z.object({
  projectId: id,
  reminderId: id.nullish(),
  note: z.string().trim().max(1000).default(''),
});

export const bookingRefInput = z.object({ projectId: id, requestId: id });

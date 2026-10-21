import { z } from 'zod';

const id = z.string().min(1).max(128);
const ore = z.number().int().min(-100_000_000).max(100_000_000);
const isoDateTime = z.iso.datetime({ offset: true });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const mediaListSchema = z
  .array(
    z.object({
      path: z.string().max(300),
      thumbPath: z.string().max(300),
      width: z.number().int(),
      height: z.number().int(),
      tags: z.array(z.string()).max(4),
    }),
  )
  .max(20)
  .default([]);

// Inputs for the M2 callables: decisions, visit reports and visit changes (PRD section 9).

export const decisionFieldsSchema = z
  .object({
    kind: z.enum(['extra_work', 'choice', 'approval']),
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000).default(''),
    priceOre: ore.optional(),
    labourOre: ore.optional(),
    materialOre: ore.optional(),
    options: z
      .array(
        z.object({
          id: z.string().min(1).max(20),
          label: z.string().trim().min(1).max(120),
          priceDeltaOre: ore.optional(),
        }),
      )
      .max(6)
      .optional(),
    respondBy: isoDate.nullable().optional(),
    media: mediaListSchema,
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'extra_work' && v.priceOre === undefined) {
      ctx.addIssue({ code: 'custom', path: ['priceOre'], message: 'price_required' });
    }
    if (v.kind === 'choice' && (!v.options || v.options.length < 2)) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'two_options_required' });
    }
    if (v.labourOre !== undefined && v.materialOre !== undefined && v.priceOre !== undefined) {
      if (v.labourOre + v.materialOre > v.priceOre) {
        ctx.addIssue({ code: 'custom', path: ['labourOre'], message: 'split_exceeds_price' });
      }
    }
  });
export type DecisionFields = z.input<typeof decisionFieldsSchema>;

export const saveDecisionDraftInput = z.object({
  projectId: id,
  postId: id.nullish(),
  decision: decisionFieldsSchema,
});

export const decisionRefInput = z.object({ projectId: id, postId: id });

export const reviseDecisionInput = z.object({
  projectId: id,
  postId: id,
  decision: decisionFieldsSchema,
});

export const respondToDecisionInput = z
  .object({
    projectId: id,
    postId: id,
    version: z.number().int().min(1),
    outcome: z.enum(['approved', 'declined', 'chosen']),
    optionId: z.string().max(20).nullish(),
    reason: z.string().trim().max(500).nullish(),
  })
  .refine((v) => v.outcome !== 'chosen' || !!v.optionId, {
    path: ['optionId'],
    message: 'option_required',
  });

export const postVisitReportInput = z.object({
  projectId: id,
  visitId: id,
  done: z
    .array(
      z.object({ itemId: z.string().max(40), label: z.string().max(120), checked: z.boolean() }),
    )
    .max(30),
  rating: z.enum(['good', 'ok', 'hard']).nullable().optional(),
  note: z.string().trim().max(2000).default(''),
  flags: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
  nextTime: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
  media: mediaListSchema,
});
export type PostVisitReportInput = z.input<typeof postVisitReportInput>;

export const requestVisitChangeInput = z.object({
  projectId: id,
  visitId: id,
  kind: z.enum(['move', 'cancel']),
  proposedStartAt: isoDateTime.nullable().optional(),
  note: z.string().trim().max(500).default(''),
});

export const respondVisitChangeInput = z.object({
  projectId: id,
  requestId: id,
  accept: z.boolean(),
  /** "Suggest another time": a different start than the client asked for. */
  startAt: isoDateTime.nullable().optional(),
});

export const scheduleInputSchema = z.object({
  interval: z.union([z.literal(1), z.literal(2)]),
  weekdays: z
    .array(z.enum(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']))
    .min(1)
    .max(7),
  startDate: isoDate,
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  durationMinutes: z.number().int().min(15).max(600),
  skipDates: z.array(isoDate).max(100).default([]),
});

export const createServiceClientInput = z.object({
  title: z.string().trim().min(1).max(120),
  clientName: z.string().trim().min(1).max(100),
  clientPhone: z.string().trim().min(1),
  address: z
    .object({
      street: z.string().trim().max(120),
      postalCode: z.string().trim().max(10),
      city: z.string().trim().max(60),
    })
    .nullable()
    .default(null),
  trade: z.enum(['tutoring', 'gardening', 'other']),
  schedule: scheduleInputSchema,
});
export type CreateServiceClientInput = z.input<typeof createServiceClientInput>;

export const updateScheduleInput = z.object({ projectId: id, schedule: scheduleInputSchema });

export const photoConsentInput = z.object({ projectId: id, consent: z.boolean() });

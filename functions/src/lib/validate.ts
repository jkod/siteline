import { HttpsError } from 'firebase-functions/https';
import type { z } from 'zod';

/** Parses callable input with a shared zod schema, or fails with `invalid-argument`. */
export function parseInput<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpsError('invalid-argument', 'invalid_input', {
      issues: result.error.issues.map((issue) => ({ path: issue.path, code: issue.code })),
    });
  }
  return result.data;
}

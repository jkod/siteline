import { type Firestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/https';

import { sha256Hex } from './crypto';

/**
 * Fixed-window rate limit kept in Firestore (PRD section 10). The key is hashed, so IP
 * addresses and phone numbers are never stored. Throws `resource-exhausted` when exceeded.
 */
export async function enforceRateLimit(
  db: Firestore,
  key: string,
  limit: number,
  windowMs: number,
  nowMs = Date.now(),
): Promise<void> {
  const ref = db.collection('rateLimits').doc(sha256Hex(key));
  const allowed = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const data = snapshot.data() as { windowStart: number; count: number } | undefined;
    if (!data || nowMs - data.windowStart >= windowMs) {
      tx.set(ref, {
        windowStart: nowMs,
        count: 1,
        expiresAt: Timestamp.fromMillis(nowMs + windowMs),
      });
      return true;
    }
    if (data.count >= limit) return false;
    tx.update(ref, { count: data.count + 1 });
    return true;
  });
  if (!allowed) throw new HttpsError('resource-exhausted', 'rate_limited');
}

const KEY = 'sl.referral';
/** A sign-up counts for an invite opened within this long (PRD F20). */
const KEEP_MS = 30 * 86_400_000;

/**
 * The invite code from /r/{code}, kept on this device until a company signs up. Sign-in by
 * email link can open a new tab, so it lives in local storage rather than the session.
 */
export function rememberReferralCode(code: string, now = Date.now()): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ code, savedAt: now }));
  } catch {
    // Private mode: the referral is then not recorded, and sign-up works as usual.
  }
}

export function pendingReferralCode(now = Date.now()): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as {
      code?: unknown;
      savedAt?: unknown;
    } | null;
    if (typeof saved?.code !== 'string' || typeof saved.savedAt !== 'number') return null;
    return now - saved.savedAt < KEEP_MS ? saved.code : null;
  } catch {
    return null;
  }
}

export function forgetReferralCode(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // See above.
  }
}

const AUTH_CODES = new Set([
  'auth/invalid-email',
  'auth/invalid-action-code',
  'auth/expired-action-code',
  'auth/network-request-failed',
  'auth/popup-blocked',
  'auth/too-many-requests',
  'auth/user-disabled',
]);

/** Error codes the callables return (PRD section 9); each has a translated message. */
const FUNCTION_CODES = new Set([
  'functions/permission-denied',
  'functions/failed-precondition',
  'functions/resource-exhausted',
  'functions/not-found',
  'functions/invalid-argument',
  'functions/unauthenticated',
  'functions/unavailable',
]);

/** Specific reasons callables give in the message, which get their own translation. */
const FUNCTION_REASONS = new Set([
  'plan_limit',
  'demo_mode',
  'invalid_contact',
  'clients_only',
  'link_expired',
  'link_revoked',
  'link_used',
  'invalid_link',
  'last_owner',
  'owners_only',
  'already_in_company',
  'clients_cannot_join',
  'unknown_crew',
  'rate_limited',
  'decision_not_open',
  'decision_changed',
  'decision_not_draft',
  'crew_cannot_send_priced',
  'photos_need_consent',
  'already_reported',
  'visit_not_open',
  'request_not_open',
]);

/** Errors that need no message, such as closing the Google sign-in popup. */
const SILENT_CODES = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request']);

function field(error: unknown, key: 'code' | 'message'): string | null {
  if (typeof error === 'object' && error !== null && key in error) {
    const value = (error as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : null;
  }
  return null;
}

/**
 * The reason a callable gave, such as "plan_limit", or null. The Functions SDK appends the HTTP
 * status to the message ("plan_limit [400]"), so that is stripped first.
 */
export function errorReason(error: unknown): string | null {
  const code = field(error, 'code');
  const message = field(error, 'message')?.replace(/\s*\[\d{3}\]$/, '');
  return code?.startsWith('functions/') && message && FUNCTION_REASONS.has(message)
    ? message
    : null;
}

/** The translation key for an error from Firebase Auth or a callable, or `null` to stay quiet. */
export function errorMessageKey(error: unknown): string | null {
  const code = field(error, 'code');
  if (code && SILENT_CODES.has(code)) return null;
  const reason = errorReason(error);
  if (reason) return `errors.reasons.${reason}`;
  if (code && (AUTH_CODES.has(code) || FUNCTION_CODES.has(code))) {
    return `errors.${code.replace('/', '.')}`;
  }
  return 'errors.unknown';
}

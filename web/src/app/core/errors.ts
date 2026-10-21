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

/** Errors that need no message, such as closing the Google sign-in popup. */
const SILENT_CODES = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request']);

function codeOf(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

/** The translation key for an error from Firebase Auth or a callable, or `null` to stay quiet. */
export function errorMessageKey(error: unknown): string | null {
  const code = codeOf(error);
  if (code && SILENT_CODES.has(code)) return null;
  if (code && (AUTH_CODES.has(code) || FUNCTION_CODES.has(code))) {
    return `errors.${code.replace('/', '.')}`;
  }
  return 'errors.unknown';
}

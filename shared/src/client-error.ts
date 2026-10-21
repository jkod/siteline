/** A browser error sent to `logClientError`. Never include personal data (PRD section 13). */
export interface ClientError {
  name?: string;
  message: string;
  stack?: string;
  path: string;
  release?: string;
}

/**
 * Replaces invite tokens and referral codes in an app path, so they never reach logs:
 * "/p/abc123" → "/p/:token".
 */
export function redactPath(path: string): string {
  return path
    .replace(/^\/p\/[^/?#]+/, '/p/:token')
    .replace(/^\/r\/[^/?#]+/, '/r/:code')
    .replace(/[?#].*$/, '');
}

/** Accepts only in-app paths as a return URL, never another origin ("//evil.example"). */
export function safeReturnUrl(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null;
  return raw;
}

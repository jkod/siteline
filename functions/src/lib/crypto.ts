import { createHash, randomBytes } from 'node:crypto';

/** A random 32-byte token, URL safe (PRD 4.1). */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

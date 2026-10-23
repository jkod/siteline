import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * A file under functions/assets (example photos, PDF fonts), found from the bundle in lib/ or
 * from the source in src/lib/ when tests run.
 */
export function assetPath(relative: string): string {
  for (const base of ['../assets/', '../../assets/']) {
    const url = new URL(`${base}${relative}`, import.meta.url);
    if (existsSync(url)) return fileURLToPath(url);
  }
  throw new Error(`Missing asset ${relative}`);
}

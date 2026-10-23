import { getDownloadURL } from 'firebase-admin/storage';
import { type Branding, type Company, projectBranding } from '@siteline/shared';

import { bucket } from './admin';

/**
 * The branding copied onto each project, so clients never read company documents (PRD 8), as
 * the plan allows: logo from Solo, colour from Team (F10).
 */
export async function brandingFor(
  company: Pick<Company, 'name' | 'logoPath' | 'accentColor' | 'plan' | 'compedUntil'>,
  now = new Date(),
): Promise<Branding> {
  const logo = company.logoPath ? await logoUrl(company.logoPath) : null;
  return projectBranding(company, logo, now.getTime());
}

async function logoUrl(path: string): Promise<string | null> {
  try {
    return await getDownloadURL(bucket().file(path));
  } catch {
    return null;
  }
}

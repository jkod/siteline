import { getDownloadURL } from 'firebase-admin/storage';
import { type Branding, type Company, showsSitelineFooter } from '@siteline/shared';

import { bucket } from './admin';

/** The branding copied onto each project, so clients never read company documents (PRD 8). */
export async function brandingFor(
  company: Pick<Company, 'name' | 'logoPath' | 'accentColor' | 'plan'>,
): Promise<Branding> {
  return {
    name: company.name,
    logoUrl: company.logoPath ? await logoUrl(company.logoPath) : null,
    accentColor: company.accentColor,
    showSitelineFooter: showsSitelineFooter(company.plan),
  };
}

async function logoUrl(path: string): Promise<string | null> {
  try {
    return await getDownloadURL(bucket().file(path));
  } catch {
    return null;
  }
}

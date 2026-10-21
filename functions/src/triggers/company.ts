import type { Firestore } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/firestore';
import type { Company } from '@siteline/shared';

import { db } from '../lib/admin';
import { brandingFor } from '../lib/branding';

const BRANDING_FIELDS = ['name', 'logoPath', 'accentColor', 'plan'] as const;

/** Copies the firm's branding and footer setting onto all its projects (PRD section 9). */
export async function syncBranding(
  firestore: Firestore,
  companyId: string,
  company: Company,
): Promise<void> {
  const branding = await brandingFor(company);
  const projects = await firestore.collection('projects').where('companyId', '==', companyId).get();
  for (let i = 0; i < projects.docs.length; i += 400) {
    const batch = firestore.batch();
    for (const doc of projects.docs.slice(i, i + 400)) batch.update(doc.ref, { branding });
    await batch.commit();
  }
}

export const onCompanyWritten = onDocumentWritten('companies/{companyId}', async (event) => {
  const before = event.data?.before.data() as Company | undefined;
  const after = event.data?.after.data() as Company | undefined;
  if (!after) return;
  const changed = !before || BRANDING_FIELDS.some((field) => before[field] !== after[field]);
  if (changed) await syncBranding(db, event.params.companyId, after);
});

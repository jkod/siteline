import type { Firestore } from 'firebase-admin/firestore';
import type { Locale, Project, StaffMember, UserDoc } from '@siteline/shared';

export interface StaffRecipient {
  uid: string;
  email: string | null;
  phone: string | null;
  locale: Locale;
  wantsEmail: boolean;
}

/** Owners, admins and the crew assigned to a project: who hears about client actions (PRD 6). */
export async function projectStaff(
  db: Firestore,
  project: Pick<Project, 'companyId' | 'crewUids'>,
  exceptUid?: string,
): Promise<StaffRecipient[]> {
  const staff = await db.collection(`companies/${project.companyId}/staff`).get();
  const relevant = staff.docs.filter((doc) => {
    const member = doc.data() as StaffMember;
    return doc.id !== exceptUid && (member.role !== 'crew' || project.crewUids.includes(doc.id));
  });
  return Promise.all(
    relevant.map(async (doc) => {
      const member = doc.data() as StaffMember;
      const user = (await db.doc(`users/${doc.id}`).get()).data() as UserDoc | undefined;
      return {
        uid: doc.id,
        email: member.email ?? user?.email ?? null,
        phone: member.phone ?? null,
        locale: user?.locale ?? 'sv',
        wantsEmail: member.notify?.email !== false,
      };
    }),
  );
}

export async function userDoc(db: Firestore, uid: string): Promise<UserDoc | undefined> {
  return (await db.doc(`users/${uid}`).get()).data() as UserDoc | undefined;
}

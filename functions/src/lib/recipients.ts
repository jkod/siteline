import type { Firestore } from 'firebase-admin/firestore';
import type { Locale, Project, ProjectMember, StaffMember, UserDoc } from '@siteline/shared';

export interface StaffRecipient {
  uid: string;
  role: StaffMember['role'];
  email: string | null;
  phone: string | null;
  locale: Locale;
  wantsEmail: boolean;
  wantsPush: boolean;
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
        role: member.role,
        email: member.email ?? user?.email ?? null,
        phone: member.phone ?? null,
        locale: user?.locale ?? 'sv',
        wantsEmail: member.notify?.email !== false,
        wantsPush: member.notify?.push !== false,
      };
    }),
  );
}

export async function userDoc(db: Firestore, uid: string): Promise<UserDoc | undefined> {
  return (await db.doc(`users/${uid}`).get()).data() as UserDoc | undefined;
}

/**
 * The channel a client hears on (PRD section 6): their choice of push (when a browser of theirs
 * has notifications on) or email, otherwise text, otherwise email.
 */
export async function clientChannel(
  db: Firestore,
  uid: string,
  user: UserDoc | undefined,
  member: ProjectMember | undefined,
): Promise<'sms' | 'email' | 'push' | null> {
  if (!user) return null;
  const preferred = member?.notify?.channel;
  if (preferred === 'push') {
    const devices = await db.collection(`users/${uid}/devices`).limit(1).get();
    if (!devices.empty) return 'push';
  }
  if (preferred === 'email' && user.email) return 'email';
  if (user.phoneE164) return 'sms';
  return user.email ? 'email' : null;
}

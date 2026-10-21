import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { type Locale, type UserDoc } from '@siteline/shared';

import { sha256Hex } from './crypto';

/**
 * Finds the client user with this phone number, or creates one. A client of several firms is
 * one user, so a new firm's project appears on their existing home screen (PRD 4.5). The
 * lookup lives in clientPhones, keyed by the number's hash, which only functions can read.
 */
export async function findOrCreateClient(
  db: Firestore,
  input: { phone: string; name: string; email: string | null; locale: Locale },
): Promise<string> {
  const lookup = db.collection('clientPhones').doc(sha256Hex(input.phone));
  return db.runTransaction(async (tx) => {
    const existing = await tx.get(lookup);
    const uid = existing.get('uid') as string | undefined;
    if (uid) return uid;
    const user = db.collection('users').doc();
    const data: UserDoc<FieldValue> = {
      kind: 'client',
      name: input.name,
      phoneE164: input.phone,
      email: input.email,
      locale: input.locale,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    tx.create(user, data);
    tx.create(lookup, { uid: user.id, createdAt: FieldValue.serverTimestamp() });
    return user.id;
  });
}

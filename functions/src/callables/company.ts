import { FieldValue } from 'firebase-admin/firestore';
import { type CallableRequest, onCall } from 'firebase-functions/https';
import {
  type Company,
  createCompanyInput,
  PLAN_LIMITS,
  type StaffMember,
  TIME_ZONE,
  type UserDoc,
} from '@siteline/shared';

import { auth, db } from '../lib/admin';
import { setStaffClaims } from '../lib/claims';
import { requireNewStaff } from '../lib/context';
import { callableOptions } from '../lib/env';
import { parseInput } from '../lib/validate';

/** Creates the company and the owner membership, and sets the owner's claims (PRD F1). */
export async function createCompanyHandler(request: CallableRequest<unknown>) {
  const caller = requireNewStaff(request);
  const input = parseInput(createCompanyInput, request.data);
  const company = db.collection('companies').doc();
  const now = FieldValue.serverTimestamp();

  const companyData: Company<FieldValue> = {
    name: input.name,
    orgNumber: input.orgNumber,
    logoPath: null,
    accentColor: input.accentColor.toUpperCase(),
    locale: input.locale,
    timeZone: TIME_ZONE,
    plan: 'free',
    compedUntil: null,
    limits: PLAN_LIMITS.free,
    usage: { activeProjects: 0, serviceClients: 0, staff: 1, smsThisMonth: 0 },
    // Invite-loop referrals are stored from M3 (F20).
    referredBy: null,
    settings: {
      digestTime: '18:00',
      reminderTime: '18:00',
      crewCanSendPricedCards: false,
      requirePhoneCheck: false,
    },
    createdAt: now,
    updatedAt: now,
  };
  const staff: StaffMember<FieldValue> = {
    role: 'owner',
    name: input.ownerName,
    email: caller.email,
    phone: null,
    joinedAt: now,
    notify: { push: true, email: true, quietHours: { start: '21:00', end: '07:00' } },
    createdAt: now,
    updatedAt: now,
  };
  const user: Partial<UserDoc<FieldValue>> = {
    kind: 'staff',
    name: input.ownerName,
    email: caller.email,
    phoneE164: null,
    locale: input.locale,
    companyId: company.id,
    updatedAt: now,
  };

  const batch = db.batch();
  batch.create(company, companyData);
  batch.create(company.collection('staff').doc(caller.uid), staff);
  batch.set(db.doc(`users/${caller.uid}`), { createdAt: now, ...user }, { merge: true });
  await batch.commit();
  await setStaffClaims(auth, caller.uid, { cid: company.id, crole: 'owner' });
  return { companyId: company.id };
}

export const createCompany = onCall(callableOptions, createCompanyHandler);

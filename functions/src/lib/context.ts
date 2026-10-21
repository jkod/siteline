import { type CallableRequest, HttpsError } from 'firebase-functions/https';
import { isStaffRole, type StaffRole } from '@siteline/shared';

export interface Caller {
  uid: string;
  email: string | null;
  isClient: boolean;
}

export interface StaffCaller extends Caller {
  companyId: string;
  role: StaffRole;
}

export function requireAuth(request: CallableRequest<unknown>): Caller {
  if (!request.auth) throw new HttpsError('unauthenticated', 'sign_in_required');
  const token = request.auth.token;
  return {
    uid: request.auth.uid,
    email: typeof token.email === 'string' ? token.email : null,
    isClient: token['kind'] === 'client',
  };
}

export function requireStaff(request: CallableRequest<unknown>): StaffCaller {
  const caller = requireAuth(request);
  const token = request.auth!.token;
  const companyId = token['cid'];
  const role = token['crole'];
  if (typeof companyId !== 'string' || !isStaffRole(role)) {
    throw new HttpsError('permission-denied', 'staff_only');
  }
  return { ...caller, companyId, role };
}

/** Owners and admins. */
export function requireManager(request: CallableRequest<unknown>): StaffCaller {
  const staff = requireStaff(request);
  if (staff.role === 'crew') throw new HttpsError('permission-denied', 'managers_only');
  return staff;
}

/** A person who signed in as staff (email link or Google) but has no company yet. */
export function requireNewStaff(request: CallableRequest<unknown>): Caller {
  const caller = requireAuth(request);
  if (caller.isClient) throw new HttpsError('permission-denied', 'clients_cannot_join');
  if (request.auth!.token['cid']) throw new HttpsError('failed-precondition', 'already_in_company');
  return caller;
}

/** Owners and admins of the project's company, or crew assigned to it. */
export function assertProjectStaff(
  staff: StaffCaller,
  project: { companyId: string; crewUids: string[] },
): void {
  const allowed =
    project.companyId === staff.companyId &&
    (staff.role !== 'crew' || project.crewUids.includes(staff.uid));
  if (!allowed) throw new HttpsError('permission-denied', 'not_on_project');
}

export function assertProjectManager(staff: StaffCaller, project: { companyId: string }): void {
  if (project.companyId !== staff.companyId || staff.role === 'crew') {
    throw new HttpsError('permission-denied', 'not_on_project');
  }
}

/** The caller's IP, for rate limits. Only its hash is stored. */
export function callerIp(request: CallableRequest<unknown>): string {
  const forwarded = request.rawRequest?.headers?.['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
  return (first ?? request.rawRequest?.ip ?? 'unknown').trim();
}

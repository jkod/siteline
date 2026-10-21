import { inject, Injectable } from '@angular/core';

import type {
  CreateCompanyInput,
  CreateProjectInput,
  InviteClientInput,
  InviteStaffInput,
  ProjectStatus,
  StaffRole,
} from '@siteline/shared';

import { FirebaseService } from './firebase';

export type RedeemResult =
  { kind: 'client'; token: string; projectId: string } | { kind: 'staff'; companyName: string };

/** Typed calls to the callable functions (PRD section 9). */
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly firebase = inject(FirebaseService);

  createCompany(input: CreateCompanyInput) {
    return this.firebase.call<CreateCompanyInput, { companyId: string }>('createCompany', input);
  }

  inviteStaff(input: InviteStaffInput) {
    return this.firebase.call<InviteStaffInput, { ok: true }>('inviteStaff', input);
  }

  acceptStaffInvite(token: string) {
    return this.firebase.call<{ token: string }, { companyId: string }>('acceptStaffInvite', {
      token,
    });
  }

  setStaffRole(uid: string, role: StaffRole) {
    return this.firebase.call('setStaffRole', { uid, role });
  }

  removeStaff(uid: string) {
    return this.firebase.call('removeStaff', { uid });
  }

  createProject(input: CreateProjectInput) {
    return this.firebase.call<CreateProjectInput, { projectId: string }>('createProject', input);
  }

  setProjectStatus(projectId: string, status: ProjectStatus) {
    return this.firebase.call('setProjectStatus', { projectId, status });
  }

  assignCrew(projectId: string, crewUids: string[]) {
    return this.firebase.call('assignCrew', { projectId, crewUids });
  }

  inviteClient(input: InviteClientInput) {
    return this.firebase.call<InviteClientInput, { uid: string }>('inviteClient', input);
  }

  resendInvite(projectId: string, uid: string) {
    return this.firebase.call('resendInvite', { projectId, uid });
  }

  revokeInvite(projectId: string, uid: string) {
    return this.firebase.call('revokeInvite', { projectId, uid });
  }

  removeClient(projectId: string, uid: string) {
    return this.firebase.call('removeClient', { projectId, uid });
  }

  redeemInvite(token: string) {
    return this.firebase.call<{ token: string }, RedeemResult>('redeemInvite', { token });
  }

  requestNewLink(token: string) {
    return this.firebase.call<{ token: string }, { ok: true }>('requestNewLink', { token });
  }
}

import { inject, Injectable } from '@angular/core';

import type {
  CreateCompanyInput,
  CreateProjectInput,
  CreateServiceClientInput,
  DecisionFields,
  InviteClientInput,
  InviteStaffInput,
  PostVisitReportInput,
  ProjectStatus,
  ScheduleInput,
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

  saveDecisionDraft(projectId: string, decision: DecisionFields, postId?: string) {
    return this.firebase.call<unknown, { postId: string }>('saveDecisionDraft', {
      projectId,
      decision,
      ...(postId ? { postId } : {}),
    });
  }

  deleteDecisionDraft(projectId: string, postId: string) {
    return this.firebase.call('deleteDecisionDraft', { projectId, postId });
  }

  sendDecision(projectId: string, postId: string) {
    return this.firebase.call('sendDecision', { projectId, postId });
  }

  reviseDecision(projectId: string, postId: string, decision: DecisionFields) {
    return this.firebase.call<unknown, { postId: string }>('reviseDecision', {
      projectId,
      postId,
      decision,
    });
  }

  withdrawDecision(projectId: string, postId: string) {
    return this.firebase.call('withdrawDecision', { projectId, postId });
  }

  respondToDecision(input: {
    projectId: string;
    postId: string;
    version: number;
    outcome: 'approved' | 'declined' | 'chosen';
    optionId?: string;
    reason?: string;
  }) {
    return this.firebase.call<unknown, { approvalId: string }>('respondToDecision', input);
  }

  exportDecisionsCsv(projectId: string) {
    return this.firebase.call<unknown, { csv: string; filename: string }>('exportDecisionsCsv', {
      projectId,
    });
  }

  createServiceClient(input: CreateServiceClientInput) {
    return this.firebase.call<CreateServiceClientInput, { projectId: string }>(
      'createServiceClient',
      input,
    );
  }

  updateSchedule(projectId: string, schedule: ScheduleInput) {
    return this.firebase.call('updateSchedule', { projectId, schedule });
  }

  setPhotoConsent(projectId: string, consent: boolean) {
    return this.firebase.call('setPhotoConsent', { projectId, consent });
  }

  postVisitReport(input: PostVisitReportInput) {
    return this.firebase.call<PostVisitReportInput, { postId: string }>('postVisitReport', input);
  }

  requestVisitChange(input: {
    projectId: string;
    visitId: string;
    kind: 'move' | 'cancel';
    proposedStartAt?: string | null;
    note?: string;
  }) {
    return this.firebase.call<unknown, { requestId: string }>('requestVisitChange', input);
  }

  respondVisitChange(input: {
    projectId: string;
    requestId: string;
    accept: boolean;
    startAt?: string | null;
  }) {
    return this.firebase.call('respondVisitChange', input);
  }
}

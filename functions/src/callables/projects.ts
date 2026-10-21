import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { type CallableRequest, HttpsError, onCall } from 'firebase-functions/https';
import {
  assignCrewInput,
  type Company,
  createProjectInput,
  effectiveLimits,
  type Project,
  type ProjectKind,
  type ProjectMember,
  type ProjectStatus,
  setProjectStatusInput,
} from '@siteline/shared';

import { db } from '../lib/admin';
import { brandingFor } from '../lib/branding';
import { assertProjectManager, requireManager } from '../lib/context';
import { callableOptions } from '../lib/env';
import { CLIENT_LINK_DAYS_AFTER_COMPLETION, setClientInviteExpiry } from '../lib/invites';
import { parseInput } from '../lib/validate';

type UsageKey = 'activeProjects' | 'serviceClients';

function usageKey(kind: ProjectKind): UsageKey {
  return kind === 'project' ? 'activeProjects' : 'serviceClients';
}

/** Throws `failed-precondition` with the limit when one more active project of this kind won't fit. */
function assertWithinLimit(company: Company, kind: ProjectKind): void {
  const key = usageKey(kind);
  const limit = effectiveLimits(company, Date.now())[key];
  if (limit !== null && company.usage[key] >= limit) {
    throw new HttpsError('failed-precondition', 'plan_limit', {
      kind: key,
      limit,
      usage: company.usage[key],
    });
  }
}

/** Reads the staff memberships of the given people and rejects anyone who isn't staff here. */
async function crewMembers(tx: Transaction, companyId: string, uids: string[]) {
  const unique = [...new Set(uids)];
  const docs = await Promise.all(
    unique.map((uid) => tx.get(db.doc(`companies/${companyId}/staff/${uid}`))),
  );
  if (docs.some((d) => !d.exists)) throw new HttpsError('invalid-argument', 'unknown_crew');
  return docs.map((d) => ({ uid: d.id, name: d.get('name') as string }));
}

function crewMember(name: string): ProjectMember<FieldValue> {
  return {
    role: 'crew',
    name,
    phoneMasked: null,
    joinedAt: FieldValue.serverTimestamp(),
    lastSeenAt: null,
    notify: { instant: true, digest: false, channel: 'email' },
    phoneVerifiedAt: null,
    invite: null,
    createdAt: FieldValue.serverTimestamp(),
  };
}

/** Creates a project, enforcing the plan's limit for its kind in a transaction (PRD F2). */
export async function createProjectHandler(request: CallableRequest<unknown>) {
  const caller = requireManager(request);
  const input = parseInput(createProjectInput, request.data);
  const companyRef = db.doc(`companies/${caller.companyId}`);
  const projectRef = db.collection('projects').doc();
  const branding = await brandingFor((await companyRef.get()).data() as Company);

  await db.runTransaction(async (tx) => {
    const company = (await tx.get(companyRef)).data() as Company | undefined;
    if (!company) throw new HttpsError('not-found', 'company_not_found');
    const crew = await crewMembers(tx, caller.companyId, input.crewUids);
    assertWithinLimit(company, input.kind);

    const now = FieldValue.serverTimestamp();
    const project: Project<FieldValue> = {
      companyId: caller.companyId,
      kind: input.kind,
      title: input.title,
      address: input.address,
      schedule: null,
      status: 'active',
      startDate: input.startDate,
      endDate: input.endDate,
      branding,
      roles: Object.fromEntries(crew.map((c) => [c.uid, 'crew'])),
      clientUids: [],
      crewUids: crew.map((c) => c.uid),
      totals: { approvedExtraWorkOre: 0, openDecisions: 0, unansweredQuestions: 0 },
      nextVisitId: null,
      lastPostAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    tx.create(projectRef, project);
    for (const c of crew)
      tx.create(projectRef.collection('members').doc(c.uid), crewMember(c.name));
    tx.update(companyRef, { [`usage.${usageKey(input.kind)}`]: FieldValue.increment(1) });
  });
  return { projectId: projectRef.id };
}

/**
 * Completes, archives or reactivates a project. Reactivating checks the plan limit; completing
 * starts the 90-day countdown on client links (PRD 4.1).
 */
export async function setProjectStatusHandler(request: CallableRequest<unknown>) {
  const caller = requireManager(request);
  const input = parseInput(setProjectStatusInput, request.data);
  const projectRef = db.doc(`projects/${input.projectId}`);
  const companyRef = db.doc(`companies/${caller.companyId}`);

  const previous = await db.runTransaction(async (tx) => {
    const project = (await tx.get(projectRef)).data() as Project | undefined;
    if (!project) throw new HttpsError('not-found', 'project_not_found');
    assertProjectManager(caller, project);
    const company = (await tx.get(companyRef)).data() as Company;
    if (project.status === input.status) return project.status;

    const key = usageKey(project.kind);
    if (input.status === 'active') {
      assertWithinLimit(company, project.kind);
      tx.update(companyRef, { [`usage.${key}`]: FieldValue.increment(1) });
    } else if (project.status === 'active') {
      tx.update(companyRef, { [`usage.${key}`]: FieldValue.increment(-1) });
    }
    tx.update(projectRef, {
      status: input.status,
      completedAt:
        input.status === 'completed' ? FieldValue.serverTimestamp() : project.completedAt,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return project.status;
  });

  if (previous !== input.status) {
    const expiry = (status: ProjectStatus) =>
      status === 'active'
        ? null
        : new Date(Date.now() + CLIENT_LINK_DAYS_AFTER_COMPLETION * 86_400_000);
    if (input.status === 'active' || previous === 'active') {
      await setClientInviteExpiry(db, input.projectId, expiry(input.status));
    }
  }
  return { ok: true };
}

/** Sets the crew assigned to a project; access follows immediately through the rules. */
export async function assignCrewHandler(request: CallableRequest<unknown>) {
  const caller = requireManager(request);
  const input = parseInput(assignCrewInput, request.data);
  const projectRef = db.doc(`projects/${input.projectId}`);

  await db.runTransaction(async (tx) => {
    const project = (await tx.get(projectRef)).data() as Project | undefined;
    if (!project) throw new HttpsError('not-found', 'project_not_found');
    assertProjectManager(caller, project);
    const crew = await crewMembers(tx, caller.companyId, input.crewUids);
    const next = new Set(crew.map((c) => c.uid));
    const removed = project.crewUids.filter((uid) => !next.has(uid));
    const added = crew.filter((c) => !project.crewUids.includes(c.uid));

    const roles = Object.fromEntries(
      Object.entries(project.roles).filter(([uid, role]) => role !== 'crew' || next.has(uid)),
    );
    for (const c of crew) roles[c.uid] = 'crew';
    tx.update(projectRef, { roles, crewUids: [...next], updatedAt: FieldValue.serverTimestamp() });
    for (const uid of removed) tx.delete(projectRef.collection('members').doc(uid));
    for (const c of added)
      tx.create(projectRef.collection('members').doc(c.uid), crewMember(c.name));
  });
  return { ok: true };
}

export const createProject = onCall(callableOptions, createProjectHandler);
export const setProjectStatus = onCall(callableOptions, setProjectStatusHandler);
export const assignCrew = onCall(callableOptions, assignCrewHandler);

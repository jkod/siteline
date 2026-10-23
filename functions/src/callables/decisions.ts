import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { type CallableRequest, HttpsError, onCall } from 'firebase-functions/https';
import {
  agreedPrice,
  type Approval,
  type Company,
  decisionRefInput,
  decisionsCsv,
  type Post,
  type Project,
  type ProjectMember,
  requiredApprovers,
  respondToDecisionInput,
  reviseDecisionInput,
  saveDecisionDraftInput,
  setApprovalRuleInput,
  type UserDoc,
} from '@siteline/shared';

import { db } from '../lib/admin';
import { assertProjectStaff, requireAuth, requireStaff, type StaffCaller } from '../lib/context';
import {
  assertCanSend,
  decisionFields,
  decisionSnapshot,
  priceLine,
  projectOrThrow,
  recountDecisions,
} from '../lib/decisions';
import { appUrl, callableOptions } from '../lib/env';
import { recordEvent } from '../lib/metrics';
import { queueMessage } from '../lib/outbox';
import { projectStaff } from '../lib/recipients';
import { parseInput } from '../lib/validate';

async function staffContext(caller: StaffCaller, projectId: string) {
  const project = projectOrThrow(
    (await db.doc(`projects/${projectId}`).get()).data() as Project | undefined,
  );
  assertProjectStaff(caller, project);
  const company = (await db.doc(`companies/${project.companyId}`).get()).data() as Company;
  const name = (await db.doc(`users/${caller.uid}`).get()).get('name') as string;
  return { project, company, name };
}

/** Texts every client on the project about a decision; decisions always notify (PRD 6). */
async function notifyClients(
  projectId: string,
  project: Project,
  postId: string,
  post: Post,
  template: 'decisionSent' | 'decisionChanged' | 'decisionWithdrawn',
): Promise<void> {
  const d = post.decision!;
  for (const uid of project.clientUids) {
    const user = (await db.doc(`users/${uid}`).get()).data() as UserDoc | undefined;
    if (!user?.phoneE164 && !user?.email) continue;
    await queueMessage(db, {
      channel: user.phoneE164 ? 'sms' : 'email',
      to: { uid, phone: user.phoneE164, email: user.email },
      recipientKind: 'client',
      template,
      params: {
        firm: project.branding.name,
        project: project.title,
        title: d.title,
        price: priceLine(d, user.locale),
        link: `${appUrl.value()}/c/${projectId}/decisions`,
        settingsPath: '/c/settings',
      },
      locale: user.locale,
      companyId: project.companyId,
      projectId,
      dedupeKey: `${template}:${postId}:v${d.version}:${uid}`,
    });
  }
}

/** Creates or updates a draft card, visible to staff only (PRD 4.3). */
export async function saveDecisionDraftHandler(request: CallableRequest<unknown>) {
  const caller = requireStaff(request);
  const input = parseInput(saveDecisionDraftInput, request.data);
  const { name } = await staffContext(caller, input.projectId);
  const posts = db.collection(`projects/${input.projectId}/posts`);
  const fields = decisionFields(input.decision);

  if (input.postId) {
    const ref = posts.doc(input.postId);
    await db.runTransaction(async (tx) => {
      const post = (await tx.get(ref)).data() as Post | undefined;
      if (!post?.decision || post.decision.status !== 'draft')
        throw new HttpsError('failed-precondition', 'decision_not_draft');
      if (caller.role === 'crew' && post.decision.createdByUid !== caller.uid) {
        throw new HttpsError('permission-denied', 'not_your_draft');
      }
      tx.update(ref, {
        text: fields.description ?? '',
        media: input.decision.media,
        decision: {
          ...fields,
          status: 'draft',
          version: 1,
          createdByUid: post.decision.createdByUid,
        },
        editedAt: FieldValue.serverTimestamp(),
      });
    });
    return { postId: input.postId };
  }

  const ref = posts.doc();
  await ref.create({
    type: 'decision',
    authorUid: caller.uid,
    authorName: name,
    authorRole: caller.role,
    text: fields.description ?? '',
    media: input.decision.media,
    visibility: 'staff',
    milestone: null,
    decision: { ...fields, status: 'draft', version: 1, createdByUid: caller.uid },
    commentCount: 0,
    unanswered: false,
    createdAt: FieldValue.serverTimestamp(),
    editedAt: null,
    deletedAt: null,
  });
  return { postId: ref.id };
}

/** Drafts can be deleted by their creator, owners and admins; sent cards never (PRD 2). */
export async function deleteDecisionDraftHandler(request: CallableRequest<unknown>) {
  const caller = requireStaff(request);
  const input = parseInput(decisionRefInput, request.data);
  await staffContext(caller, input.projectId);
  const ref = db.doc(`projects/${input.projectId}/posts/${input.postId}`);
  await db.runTransaction(async (tx) => {
    const post = (await tx.get(ref)).data() as Post | undefined;
    if (!post?.decision || post.decision.status !== 'draft')
      throw new HttpsError('failed-precondition', 'decision_not_draft');
    if (caller.role === 'crew' && post.decision.createdByUid !== caller.uid)
      throw new HttpsError('permission-denied', 'not_your_draft');
    tx.delete(ref);
  });
  return { ok: true };
}

/** Sends a draft to the clients: it becomes visible and they're told at once (PRD 4.3). */
export async function sendDecisionHandler(request: CallableRequest<unknown>) {
  const caller = requireStaff(request);
  const input = parseInput(decisionRefInput, request.data);
  const { project, company } = await staffContext(caller, input.projectId);
  const ref = db.doc(`projects/${input.projectId}/posts/${input.postId}`);
  const post = await db.runTransaction(async (tx) => {
    const current = (await tx.get(ref)).data() as Post | undefined;
    if (!current?.decision || current.decision.status !== 'draft')
      throw new HttpsError('failed-precondition', 'decision_not_draft');
    assertCanSend(caller, company, current.decision);
    const decision = {
      ...current.decision,
      status: 'sent' as const,
      sentAt: FieldValue.serverTimestamp(),
      sentByUid: caller.uid,
      // The project's approval rule as it is now; later changes don't move the goalposts.
      requiredApproverUids: requiredApprovers(
        project.approvalRule,
        current.decision,
        project.clientUids,
      ),
      approvals: [],
    };
    // Sending moves the card to the top of the feed.
    tx.update(ref, { visibility: 'all', decision, createdAt: FieldValue.serverTimestamp() });
    return { ...current, decision: { ...current.decision, status: 'sent' as const } };
  });
  await recountDecisions(db, input.projectId);
  await notifyClients(input.projectId, project, input.postId, post, 'decisionSent');
  return { ok: true };
}

/**
 * Edits a sent card: the old version is superseded and stays read-only, and a new version is
 * sent (PRD 4.3). An answer to the old version is rejected from then on.
 */
export async function reviseDecisionHandler(request: CallableRequest<unknown>) {
  const caller = requireStaff(request);
  const input = parseInput(reviseDecisionInput, request.data);
  const { project, company, name } = await staffContext(caller, input.projectId);
  const oldRef = db.doc(`projects/${input.projectId}/posts/${input.postId}`);
  const newRef = db.collection(`projects/${input.projectId}/posts`).doc();
  const fields = decisionFields(input.decision);

  const created = await db.runTransaction(async (tx) => {
    const old = (await tx.get(oldRef)).data() as Post | undefined;
    if (!old?.decision || old.decision.status !== 'sent')
      throw new HttpsError('failed-precondition', 'decision_not_open');
    assertCanSend(caller, company, old.decision);
    assertCanSend(caller, company, fields);
    const version = old.decision.version + 1;
    tx.update(oldRef, { 'decision.status': 'superseded' });
    const post = {
      type: 'decision' as const,
      authorUid: caller.uid,
      authorName: name,
      authorRole: caller.role,
      text: fields.description ?? '',
      media: input.decision.media,
      visibility: 'all' as const,
      milestone: null,
      decision: {
        ...fields,
        status: 'sent' as const,
        version,
        supersedesPostId: input.postId,
        createdByUid: old.decision.createdByUid,
        sentAt: FieldValue.serverTimestamp(),
        sentByUid: caller.uid,
        requiredApproverUids: requiredApprovers(project.approvalRule, fields, project.clientUids),
        approvals: [],
      },
      commentCount: 0,
      unanswered: false,
      createdAt: FieldValue.serverTimestamp(),
      editedAt: null,
      deletedAt: null,
    };
    tx.create(newRef, post);
    return post as unknown as Post;
  });
  await recountDecisions(db, input.projectId);
  await notifyClients(input.projectId, project, newRef.id, created, 'decisionChanged');
  return { postId: newRef.id };
}

export async function withdrawDecisionHandler(request: CallableRequest<unknown>) {
  const caller = requireStaff(request);
  const input = parseInput(decisionRefInput, request.data);
  const { project, company } = await staffContext(caller, input.projectId);
  const ref = db.doc(`projects/${input.projectId}/posts/${input.postId}`);
  const post = await db.runTransaction(async (tx) => {
    const current = (await tx.get(ref)).data() as Post | undefined;
    if (!current?.decision || current.decision.status !== 'sent')
      throw new HttpsError('failed-precondition', 'decision_not_open');
    assertCanSend(caller, company, current.decision);
    tx.update(ref, {
      'decision.status': 'withdrawn',
      'decision.decidedAt': FieldValue.serverTimestamp(),
    });
    return current;
  });
  await recountDecisions(db, input.projectId);
  await notifyClients(input.projectId, project, input.postId, post, 'decisionWithdrawn');
  return { ok: true };
}

const OUTCOME_WORDS = {
  sv: { approved: 'godkänt', declined: 'avböjt', chosen: 'valt' },
  en: { approved: 'approved', declined: 'declined', chosen: 'chose' },
};

/**
 * A client approves, declines or chooses (PRD F6). In one transaction: the card must still be
 * sent and on the same version, the approval record is written once (its ID is the post and
 * version), and the card records the outcome. Staff can never answer on a client's behalf.
 */
export async function respondToDecisionHandler(request: CallableRequest<unknown>) {
  const caller = requireAuth(request);
  const input = parseInput(respondToDecisionInput, request.data);
  const project = projectOrThrow(
    (await db.doc(`projects/${input.projectId}`).get()).data() as Project | undefined,
  );
  if (!project.clientUids.includes(caller.uid))
    throw new HttpsError('permission-denied', 'clients_only');

  const postRef = db.doc(`projects/${input.projectId}/posts/${input.postId}`);
  const member = (
    await db.doc(`projects/${input.projectId}/members/${caller.uid}`).get()
  ).data() as ProjectMember | undefined;

  const result = await db
    .runTransaction(async (tx) => {
      const post = (await tx.get(postRef)).data() as Post | undefined;
      const d = post?.decision;
      if (!post || !d || post.visibility !== 'all')
        throw new HttpsError('not-found', 'decision_not_found');
      if (d.version !== input.version)
        throw new HttpsError('failed-precondition', 'decision_changed');
      if (d.status !== 'sent') throw new HttpsError('failed-precondition', 'decision_not_open');
      const valid =
        input.outcome === 'declined' ||
        (input.outcome === 'approved' && d.kind !== 'choice') ||
        (input.outcome === 'chosen' &&
          d.kind === 'choice' &&
          !!d.options?.some((o) => o.id === input.optionId));
      if (!valid) throw new HttpsError('invalid-argument', 'invalid_outcome');

      // "All must approve": the clients fixed at sending who are still on the project. Each
      // answers with their own record; one decline declines the card.
      const required = (d.requiredApproverUids ?? []).filter((uid) =>
        project.clientUids.includes(uid),
      );
      const shared = required.length > 1;
      if (shared && !required.includes(caller.uid))
        throw new HttpsError('permission-denied', 'not_an_approver');
      const earlier = d.approvals ?? [];
      const optionId = input.outcome === 'chosen' ? input.optionId! : null;
      if (shared && optionId && earlier[0] && earlier[0].optionId !== optionId)
        throw new HttpsError('failed-precondition', 'choice_differs');

      const approvalRef = db.doc(
        `projects/${input.projectId}/approvals/${input.postId}_v${input.version}${shared ? `_${caller.uid}` : ''}`,
      );
      const { snapshot, sha256 } = decisionSnapshot(post, project.title);
      const approval: Approval<FieldValue> = {
        postId: input.postId,
        version: d.version,
        kind: 'decision',
        outcome: input.outcome,
        optionId,
        priceOre: input.outcome === 'declined' ? null : agreedPrice(d, optionId),
        reason: input.outcome === 'declined' ? (input.reason ?? null) : null,
        snapshot,
        snapshotSha256: sha256,
        actorUid: caller.uid,
        actorName: member?.name ?? '',
        actorPhoneMasked: member?.phoneMasked ?? null,
        phoneVerified: false,
        createdAt: FieldValue.serverTimestamp(),
      };
      // create() fails if the record exists, so each person's answer is written exactly once.
      tx.create(approvalRef, approval);

      const approvals = [
        ...earlier,
        {
          uid: caller.uid,
          name: approval.actorName,
          optionId,
          approvalId: approvalRef.id,
          at: Timestamp.now(),
        },
      ];
      const complete =
        input.outcome === 'declined' ||
        !shared ||
        required.every((uid) => approvals.some((a) => a.uid === uid));
      if (!complete) {
        tx.update(postRef, { 'decision.approvals': approvals });
        return { post, actorName: approval.actorName, complete, approvalId: approvalRef.id };
      }
      tx.update(postRef, {
        'decision.status': input.outcome === 'declined' ? 'declined' : 'approved',
        'decision.decidedAt': FieldValue.serverTimestamp(),
        'decision.selectedOptionId': optionId,
        'decision.approvalId': approvalRef.id,
        'decision.decidedByName':
          input.outcome === 'declined' || !shared
            ? approval.actorName
            : approvals.map((a) => a.name).join(' & '),
        'decision.declineReason': approval.reason,
        ...(shared && input.outcome !== 'declined' ? { 'decision.approvals': approvals } : {}),
      });
      return { post, actorName: approval.actorName, complete, approvalId: approvalRef.id };
    })
    .catch((error: unknown) => {
      if ((error as { code?: number }).code === 6)
        throw new HttpsError('already-exists', 'already_answered');
      throw error;
    });

  // Staff hear when a card is decided, not about each partial approval.
  if (!result.complete) return { approvalId: result.approvalId, complete: false };
  await recountDecisions(db, input.projectId);
  const d = result.post.decision!;
  const recipients = (await projectStaff(db, project)).filter(
    (s) => s.uid === d.createdByUid || s.role !== 'crew',
  );
  for (const staff of recipients) {
    if (!staff.email || !staff.wantsEmail) continue;
    await queueMessage(db, {
      channel: 'email',
      to: { uid: staff.uid, email: staff.email },
      recipientKind: 'staff',
      template: 'decisionAnswered',
      params: {
        client: result.actorName,
        outcome: OUTCOME_WORDS[staff.locale][input.outcome],
        title: d.title,
        project: project.title,
        link: `${appUrl.value()}/app/projects/${input.projectId}/decisions`,
      },
      locale: staff.locale,
      companyId: project.companyId,
      projectId: input.projectId,
      dedupeKey: `answered:${result.approvalId}:${staff.uid}`,
    });
  }
  await recordEvent(db, {
    name: 'decision_answered',
    companyId: project.companyId,
    projectId: input.projectId,
    uid: caller.uid,
    role: 'client',
    props: { outcome: input.outcome },
  });
  return { approvalId: result.approvalId, complete: true };
}

/** All sent decisions as CSV, for staff and for the records (PRD F6, section 10). */
export async function exportDecisionsCsvHandler(request: CallableRequest<unknown>) {
  const caller = requireStaff(request);
  const input = parseInput(decisionRefInput.pick({ projectId: true }), request.data);
  const { project } = await staffContext(caller, input.projectId);
  const posts = await db
    .collection(`projects/${input.projectId}/posts`)
    .where('type', '==', 'decision')
    .get();
  const approvals = await db.collection(`projects/${input.projectId}/approvals`).get();
  const byId = new Map(approvals.docs.map((a) => [a.id, a.data() as Approval<Timestamp>]));
  const rows = posts.docs
    .map((doc) => doc.data() as Post<Timestamp>)
    .filter((p) => p.decision && p.decision.status !== 'draft')
    .sort((a, b) => (a.decision!.sentAt?.toMillis() ?? 0) - (b.decision!.sentAt?.toMillis() ?? 0))
    .map((p) => {
      const d = p.decision!;
      const approval = d.approvalId ? byId.get(d.approvalId) : undefined;
      return {
        title: d.title,
        kind: d.kind,
        status: d.status,
        version: d.version,
        priceOre: d.kind === 'extra_work' ? (d.priceOre ?? null) : (approval?.priceOre ?? null),
        sentAt: d.sentAt?.toDate() ?? null,
        decidedAt: d.decidedAt?.toDate() ?? null,
        decidedBy: d.decidedByName ?? approval?.actorName ?? '',
        choice: d.options?.find((o) => o.id === d.selectedOptionId)?.label ?? '',
        reason: d.declineReason ?? '',
      };
    });
  const slug = project.title
    .toLowerCase()
    .replace(/[^a-z0-9åäö]+/g, '-')
    .replace(/^-|-$/g, '');
  return { csv: decisionsCsv(rows), filename: `beslut-${slug || 'projekt'}.csv` };
}

/**
 * A client sets who must approve priced decisions on their project: any one client, or all of
 * them (the user's request). The change is announced in the feed for everyone on the project,
 * and cards already sent keep the rule they were sent under.
 */
export async function setApprovalRuleHandler(request: CallableRequest<unknown>) {
  const caller = requireAuth(request);
  const input = parseInput(setApprovalRuleInput, request.data);
  const projectRef = db.doc(`projects/${input.projectId}`);
  const project = projectOrThrow((await projectRef.get()).data() as Project | undefined);
  if (!project.clientUids.includes(caller.uid))
    throw new HttpsError('permission-denied', 'clients_only');
  if ((project.approvalRule ?? 'any') === input.rule) return { changed: false };
  const member = (await projectRef.collection('members').doc(caller.uid).get()).data() as
    ProjectMember | undefined;
  const batch = db.batch();
  batch.update(projectRef, { approvalRule: input.rule, updatedAt: FieldValue.serverTimestamp() });
  batch.create(projectRef.collection('posts').doc(), {
    type: 'system',
    authorUid: caller.uid,
    authorName: member?.name ?? '',
    authorRole: 'client',
    text: '',
    media: [],
    visibility: 'all',
    milestone: null,
    system: { event: 'approval_rule', rule: input.rule },
    commentCount: 0,
    unanswered: false,
    createdAt: FieldValue.serverTimestamp(),
    editedAt: null,
    deletedAt: null,
  });
  await batch.commit();
  return { changed: true };
}

export const setApprovalRule = onCall(callableOptions, setApprovalRuleHandler);
export const saveDecisionDraft = onCall(callableOptions, saveDecisionDraftHandler);
export const deleteDecisionDraft = onCall(callableOptions, deleteDecisionDraftHandler);
export const sendDecision = onCall(callableOptions, sendDecisionHandler);
export const reviseDecision = onCall(callableOptions, reviseDecisionHandler);
export const withdrawDecision = onCall(callableOptions, withdrawDecisionHandler);
export const respondToDecision = onCall(callableOptions, respondToDecisionHandler);
export const exportDecisionsCsv = onCall(callableOptions, exportDecisionsCsvHandler);

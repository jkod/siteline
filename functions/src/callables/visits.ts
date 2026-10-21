import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { type CallableRequest, HttpsError, onCall } from 'firebase-functions/https';
import {
  buildSchedule,
  type ChecklistItem,
  createServiceClientInput,
  DEFAULT_TEMPLATES,
  occurrences,
  phoneSchema,
  photoConsentInput,
  postVisitReportInput,
  type Project,
  type ProjectMember,
  type ReportTemplate,
  requestVisitChangeInput,
  respondVisitChangeInput,
  type Trade,
  updateScheduleInput,
  type UserDoc,
  type Visit,
  type VisitRequest,
} from '@siteline/shared';

import { db } from '../lib/admin';
import {
  assertProjectManager,
  assertProjectStaff,
  requireAuth,
  requireManager,
  requireStaff,
} from '../lib/context';
import { projectOrThrow } from '../lib/decisions';
import { appUrl, callableOptions } from '../lib/env';
import { visitWhen } from '../lib/format';
import { queueMessage } from '../lib/outbox';
import { projectStaff } from '../lib/recipients';
import { parseInput } from '../lib/validate';
import { generateVisitsForProject, nextPlannedVisit, scheduledVisitId } from '../lib/visits';
import { addClientToProject } from './clients';
import { createProjectRecord } from './projects';

async function loadProject(projectId: string) {
  return projectOrThrow(
    (await db.doc(`projects/${projectId}`).get()).data() as Project | undefined,
  );
}

async function templateFor(companyId: string, trade: string): Promise<ReportTemplate> {
  const stored = (await db.doc(`companies/${companyId}/templates/${trade}`).get()).data() as
    ReportTemplate | undefined;
  return stored ?? DEFAULT_TEMPLATES[(trade in DEFAULT_TEMPLATES ? trade : 'other') as Trade];
}

/**
 * Adds a service client in one step (PRD 4.4): the project with its schedule and report
 * template, the client and their link, and the visits for the next eight weeks.
 */
export async function createServiceClientHandler(request: CallableRequest<unknown>) {
  const caller = requireManager(request);
  const input = parseInput(createServiceClientInput, request.data);
  const phone = phoneSchema.safeParse(input.clientPhone);
  if (!phone.success) throw new HttpsError('invalid-argument', 'invalid_phone');
  const schedule = buildSchedule(input.schedule);
  const projectId = await createProjectRecord(caller, {
    kind: 'service',
    title: input.title,
    address: input.address,
    startDate: input.schedule.startDate,
    endDate: null,
    crewUids: [],
    schedule,
    templateId: input.trade,
  });
  await generateVisitsForProject(db, projectId, { companyId: caller.companyId, schedule });
  await addClientToProject(caller, projectId, {
    name: input.clientName,
    phone: phone.data,
    email: null,
  });
  return { projectId };
}

/**
 * Changes a service client's schedule. Future scheduled visits that no longer fit are removed
 * unless reported; visits moved by hand keep their date ID and are kept if their date still fits.
 */
export async function updateScheduleHandler(request: CallableRequest<unknown>) {
  const caller = requireManager(request);
  const input = parseInput(updateScheduleInput, request.data);
  const project = await loadProject(input.projectId);
  assertProjectManager(caller, project);
  if (project.kind !== 'service')
    throw new HttpsError('failed-precondition', 'not_a_service_client');
  const schedule = buildSchedule(input.schedule);
  await db
    .doc(`projects/${input.projectId}`)
    .update({ schedule, updatedAt: FieldValue.serverTimestamp() });

  const now = new Date();
  const keep = new Set(
    occurrences(schedule, now, new Date(now.getTime() + 8 * 7 * 86_400_000)).map((o) =>
      scheduledVisitId(o.date),
    ),
  );
  const future = await db
    .collection(`projects/${input.projectId}/visits`)
    .where('fromSchedule', '==', true)
    .where('status', '==', 'planned')
    .where('startAt', '>=', Timestamp.fromDate(now))
    .get();
  const batch = db.batch();
  for (const visit of future.docs)
    if (!keep.has(visit.id) && !visit.get('reportPostId')) batch.delete(visit.ref);
  await batch.commit();
  await generateVisitsForProject(
    db,
    input.projectId,
    { companyId: project.companyId, schedule },
    now,
  );
  return { ok: true };
}

/** Records (or withdraws) a parent's consent to photos in tutoring reports (PRD section 10). */
export async function setPhotoConsentHandler(request: CallableRequest<unknown>) {
  const caller = requireStaff(request);
  const input = parseInput(photoConsentInput, request.data);
  const project = await loadProject(input.projectId);
  assertProjectStaff(caller, project);
  await db.doc(`projects/${input.projectId}`).update({
    photoConsentAt: input.consent ? FieldValue.serverTimestamp() : null,
  });
  return { ok: true };
}

/**
 * Sends a visit report (PRD 4.4): a post linked to the visit, the visit marked done, and the
 * items for next time on the next visit's checklist. The client is notified straight away by
 * onPostWritten. Tutoring reports carry photos only after recorded consent.
 */
export async function postVisitReportHandler(request: CallableRequest<unknown>) {
  const caller = requireStaff(request);
  const input = parseInput(postVisitReportInput, request.data);
  const project = await loadProject(input.projectId);
  assertProjectStaff(caller, project);
  const templateId = project.templateId ?? 'other';
  if (templateId === 'tutoring' && input.media.length > 0 && !project.photoConsentAt) {
    throw new HttpsError('failed-precondition', 'photos_need_consent');
  }
  const template = await templateFor(project.companyId, templateId);
  const author = (await db.doc(`users/${caller.uid}`).get()).get('name') as string;
  const visitRef = db.doc(`projects/${input.projectId}/visits/${input.visitId}`);
  const postRef = db.collection(`projects/${input.projectId}/posts`).doc();
  const nextVisitId =
    (await nextPlannedVisit(db, input.projectId, new Date(), input.visitId))?.id ?? null;
  const side = template.trade === 'tutoring' ? 'client' : 'firm';

  await db.runTransaction(async (tx) => {
    const visit = (await tx.get(visitRef)).data() as Visit | undefined;
    if (!visit) throw new HttpsError('not-found', 'visit_not_found');
    if (visit.reportPostId) throw new HttpsError('failed-precondition', 'already_reported');
    if (visit.status === 'cancelled')
      throw new HttpsError('failed-precondition', 'visit_cancelled');

    const itemIds: string[] = [];
    for (const text of input.nextTime) {
      const ref = db.collection(`projects/${input.projectId}/checklist`).doc();
      itemIds.push(ref.id);
      tx.create(ref, {
        text,
        side,
        visitId: nextVisitId,
        createdBy: caller.uid,
        createdByName: author,
        createdAt: FieldValue.serverTimestamp(),
        doneBy: null,
        doneByName: null,
        doneAt: null,
      } satisfies ChecklistItem<FieldValue>);
    }
    tx.create(postRef, {
      type: 'visit_report',
      authorUid: caller.uid,
      authorName: author,
      authorRole: caller.role,
      text: input.note,
      media: input.media,
      visibility: 'all',
      milestone: null,
      report: {
        visitId: input.visitId,
        templateId,
        done: input.done,
        rating: template.fields.rating ? (input.rating ?? null) : null,
        note: input.note,
        flags: input.flags,
        nextTimeItemIds: itemIds,
        nextTime: input.nextTime,
      },
      commentCount: 0,
      unanswered: false,
      createdAt: FieldValue.serverTimestamp(),
      editedAt: null,
      deletedAt: null,
    });
    tx.update(visitRef, {
      status: 'done',
      reportPostId: postRef.id,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return { postId: postRef.id };
}

/** A client asks to move or cancel one visit; staff are told at once (PRD 4.4). */
export async function requestVisitChangeHandler(request: CallableRequest<unknown>) {
  const caller = requireAuth(request);
  const input = parseInput(requestVisitChangeInput, request.data);
  const project = await loadProject(input.projectId);
  if (!project.clientUids.includes(caller.uid))
    throw new HttpsError('permission-denied', 'clients_only');
  const visit = (
    await db.doc(`projects/${input.projectId}/visits/${input.visitId}`).get()
  ).data() as Visit<Timestamp> | undefined;
  if (!visit || visit.status !== 'planned' || visit.startAt.toMillis() < Date.now()) {
    throw new HttpsError('failed-precondition', 'visit_not_open');
  }
  if (input.kind === 'move' && !input.proposedStartAt)
    throw new HttpsError('invalid-argument', 'time_required');
  const member = (
    await db.doc(`projects/${input.projectId}/members/${caller.uid}`).get()
  ).data() as ProjectMember | undefined;
  const ref = db.collection(`projects/${input.projectId}/visitRequests`).doc();
  await ref.create({
    visitId: input.visitId,
    kind: input.kind,
    proposedStartAt: input.proposedStartAt
      ? Timestamp.fromDate(new Date(input.proposedStartAt))
      : null,
    note: input.note,
    status: 'open',
    createdBy: caller.uid,
    createdByName: member?.name ?? '',
    resolvedBy: null,
    createdAt: FieldValue.serverTimestamp(),
    resolvedAt: null,
  } satisfies VisitRequest<FieldValue | Timestamp>);

  for (const staff of await projectStaff(db, project)) {
    if (!staff.email || !staff.wantsEmail) continue;
    await queueMessage(db, {
      channel: 'email',
      to: { uid: staff.uid, email: staff.email },
      recipientKind: 'staff',
      template: 'visitChangeRequested',
      params: {
        client: member?.name ?? '',
        action:
          input.kind === 'move'
            ? staff.locale === 'sv'
              ? 'flytta'
              : 'move'
            : staff.locale === 'sv'
              ? 'ställa in'
              : 'cancel',
        when: visitWhen(visit.startAt.toDate(), staff.locale),
        note: input.note,
        project: project.title,
        link: `${appUrl.value()}/app/projects/${input.projectId}/visit`,
      },
      locale: staff.locale,
      companyId: project.companyId,
      projectId: input.projectId,
      dedupeKey: `visitRequest:${ref.id}:${staff.uid}`,
    });
  }
  return { requestId: ref.id };
}

/**
 * Staff accept a request, accept it with another time, or decline it. Moving or cancelling only
 * that visit leaves the series alone; onVisitWritten tells the client what changed.
 */
export async function respondVisitChangeHandler(request: CallableRequest<unknown>) {
  const caller = requireStaff(request);
  const input = parseInput(respondVisitChangeInput, request.data);
  const project = await loadProject(input.projectId);
  assertProjectStaff(caller, project);
  const requestRef = db.doc(`projects/${input.projectId}/visitRequests/${input.requestId}`);

  const outcome = await db.runTransaction(async (tx) => {
    const req = (await tx.get(requestRef)).data() as VisitRequest<Timestamp> | undefined;
    if (!req || req.status !== 'open')
      throw new HttpsError('failed-precondition', 'request_not_open');
    const visitRef = db.doc(`projects/${input.projectId}/visits/${req.visitId}`);
    const visit = (await tx.get(visitRef)).data() as Visit<Timestamp> | undefined;
    if (!visit) throw new HttpsError('not-found', 'visit_not_found');
    tx.update(requestRef, {
      status: input.accept ? 'accepted' : 'declined',
      resolvedBy: caller.uid,
      resolvedAt: FieldValue.serverTimestamp(),
    });
    if (!input.accept) return { declined: true, req, visit };
    if (req.kind === 'cancel') {
      tx.update(visitRef, { status: 'cancelled', updatedAt: FieldValue.serverTimestamp() });
    } else {
      const start = input.startAt ? new Date(input.startAt) : req.proposedStartAt!.toDate();
      const duration = visit.endAt ? visit.endAt.toMillis() - visit.startAt.toMillis() : null;
      tx.update(visitRef, {
        startAt: Timestamp.fromDate(start),
        endAt: duration ? Timestamp.fromMillis(start.getTime() + duration) : null,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return { declined: false, req, visit };
  });

  if (outcome.declined) {
    const user = (await db.doc(`users/${outcome.req.createdBy}`).get()).data() as
      UserDoc | undefined;
    if (user?.phoneE164 || user?.email) {
      await queueMessage(db, {
        channel: user.phoneE164 ? 'sms' : 'email',
        to: { uid: outcome.req.createdBy, phone: user.phoneE164, email: user.email },
        recipientKind: 'client',
        template: 'visitChangeDeclined',
        params: {
          firm: project.branding.name,
          when: visitWhen(outcome.visit.startAt.toDate(), user.locale),
          link: `${appUrl.value()}/c/${input.projectId}/visit`,
          settingsPath: '/c/settings',
        },
        locale: user.locale,
        companyId: project.companyId,
        projectId: input.projectId,
        dedupeKey: `visitRequestDeclined:${input.requestId}`,
      });
    }
  }
  return { ok: true };
}

export const createServiceClient = onCall(callableOptions, createServiceClientHandler);
export const updateSchedule = onCall(callableOptions, updateScheduleHandler);
export const setPhotoConsent = onCall(callableOptions, setPhotoConsentHandler);
export const postVisitReport = onCall(callableOptions, postVisitReportHandler);
export const requestVisitChange = onCall(callableOptions, requestVisitChangeHandler);
export const respondVisitChange = onCall(callableOptions, respondVisitChangeHandler);

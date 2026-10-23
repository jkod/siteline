import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { type CallableRequest, HttpsError, onCall } from 'firebase-functions/https';
import {
  type Approval,
  approvedExtraWorkTotal,
  bookingRefInput,
  type BookingRequest,
  type Company,
  type ConditionReport,
  DEFAULT_ACCENT,
  effectivePlan,
  type Handover,
  type Media,
  planFeatures,
  type Post,
  postConditionInput,
  postRefInput,
  type Project,
  type ProjectMember,
  projectOnlyInput,
  type Reminder,
  reminderRefInput,
  requestBookingInput,
  saveHandoverInput,
  saveReminderInput,
  type UserDoc,
  zonedTimeToUtc,
} from '@siteline/shared';

import { bucket, db } from '../lib/admin';
import {
  assertProjectManager,
  assertProjectStaff,
  requireAuth,
  requireStaff,
  type StaffCaller,
} from '../lib/context';
import { sha256Hex } from '../lib/crypto';
import { projectOrThrow } from '../lib/decisions';
import { appUrl, callableOptions } from '../lib/env';
import { type HandoverContent, type Image, renderHandoverPdf } from '../lib/handover-pdf';
import { queueMessage, queuePush } from '../lib/outbox';
import { projectStaff } from '../lib/recipients';
import { parseInput } from '../lib/validate';
import { changeProjectStatus } from './projects';

const handoverRef = (projectId: string) => db.doc(`projects/${projectId}/handover/current`);

async function loadProject(projectId: string): Promise<Project> {
  return projectOrThrow(
    (await db.doc(`projects/${projectId}`).get()).data() as Project | undefined,
  );
}

async function features(companyId: string) {
  const company = (await db.doc(`companies/${companyId}`).get()).data() as Company;
  return { company, features: planFeatures(effectivePlan(company, Date.now())) };
}

async function managerOf(request: CallableRequest<unknown>, projectId: string) {
  const caller = requireStaff(request);
  const project = await loadProject(projectId);
  assertProjectManager(caller, project);
  return { caller, project };
}

/** The handover editor's content (PRD F9). The PDF and its versions are kept as they are. */
export async function saveHandoverHandler(request: CallableRequest<unknown>) {
  const input = parseInput(saveHandoverInput, request.data);
  await managerOf(request, input.projectId);
  const { projectId, ...fields } = input;
  await handoverRef(projectId).set(
    { ...fields, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  return { ok: true };
}

/** Reads photos from Storage as data URLs, a few at a time. */
async function images(paths: string[]): Promise<Map<string, Image>> {
  const result = new Map<string, Image>();
  const unique = [...new Set(paths)];
  for (let i = 0; i < unique.length; i += 8) {
    await Promise.all(
      unique.slice(i, i + 8).map(async (path) => {
        const [bytes] = await bucket().file(path).download();
        result.set(
          path,
          path.endsWith('.svg')
            ? { svg: bytes.toString('utf8') }
            : {
                dataUrl: `data:image/${path.endsWith('.png') ? 'png' : 'jpeg'};base64,${bytes.toString('base64')}`,
              },
        );
      }),
    );
  }
  return result;
}

/**
 * Builds the handover pack (PRD F9) from the editor and the project's history: milestones,
 * approved extras with who approved them and the total, hidden-work photos (F18) and condition
 * check-ins (F12). Each run is a new version. The project is marked completed and clients are
 * told at once.
 */
export async function generateHandoverHandler(request: CallableRequest<unknown>) {
  const { projectId } = parseInput(projectOnlyInput, request.data);
  const { caller, project } = await managerOf(request, projectId);
  if (project.kind !== 'project') throw new HttpsError('failed-precondition', 'projects_only');
  const { company, features: plan } = await features(project.companyId);
  const handover = ((await handoverRef(projectId).get()).data() ?? {}) as Partial<
    Handover<Timestamp>
  >;

  const posts = (await db.collection(`projects/${projectId}/posts`).orderBy('createdAt').get()).docs
    .map((d) => d.data() as Post<Timestamp>)
    .filter((p) => !p.deletedAt && p.visibility === 'all');
  const decisions = posts.map((p) => p.decision).filter((d): d is NonNullable<typeof d> => !!d);
  const extras = posts.filter(
    (p) => p.decision?.kind === 'extra_work' && p.decision.status === 'approved',
  );
  const hidden = posts.flatMap((p) =>
    p.media.filter((m) => m.tags.includes('hidden_work')).map((m) => ({ post: p, media: m })),
  );
  const conditions = posts.filter((p) => p.type === 'condition' && p.condition);
  const members = await db
    .collection(`projects/${projectId}/members`)
    .where('role', '==', 'client')
    .get();

  const photos = await images([
    ...(handover.beforeAfter ?? []).flatMap((pair) => [pair.before.path, pair.after.path]),
    ...hidden.map((h) => h.media.thumbPath),
    ...conditions
      .flatMap((p) => p.condition!.items.map((i) => p.media[i.mediaIndex]?.thumbPath ?? ''))
      .filter(Boolean),
    ...(plan.logo && company.logoPath ? [company.logoPath] : []),
  ]);
  const photo = (path: string) => photos.get(path)!;

  const version = (handover.versions?.length ?? 0) + 1;
  const now = new Date();
  const content: HandoverContent = {
    locale: company.locale,
    firm: {
      name: project.branding.name,
      accentColor: plan.colours ? company.accentColor : DEFAULT_ACCENT,
      logo: plan.logo && company.logoPath ? photo(company.logoPath) : null,
    },
    project: {
      title: project.title,
      address: project.address
        ? `${project.address.street}, ${project.address.postalCode} ${project.address.city}`
        : null,
      startDate: project.startDate,
      endDate: project.endDate,
      clients: members.docs.map((m) => (m.data() as ProjectMember).name),
    },
    generatedAt: now,
    version,
    summary: handover.summary ?? '',
    milestones: posts
      .filter((p) => p.type === 'milestone')
      .map((p) => ({ name: p.text, at: p.createdAt.toDate() })),
    beforeAfter: (handover.beforeAfter ?? []).map((pair) => ({
      before: photo(pair.before.path),
      after: photo(pair.after.path),
      caption: pair.caption,
    })),
    materials: handover.materials ?? [],
    extras: extras.map((p) => ({
      title: p.decision!.title,
      approvedBy: p.decision!.decidedByName ?? '',
      at: (p.decision!.decidedAt ?? p.createdAt).toDate(),
      priceOre: p.decision!.priceOre ?? 0,
    })),
    extrasTotalOre: approvedExtraWorkTotal(decisions),
    hiddenWork: hidden.map((h) => ({
      photo: photo(h.media.thumbPath),
      text: h.post.text,
      at: h.post.createdAt.toDate(),
    })),
    conditions: conditions.map((p) => ({
      at: p.createdAt.toDate(),
      items: p
        .condition!.items.filter((i) => p.media[i.mediaIndex])
        .map((i) => ({
          photo: photo(p.media[i.mediaIndex]!.thumbPath),
          note: i.note,
          location: i.location,
        })),
      acknowledgedBy: p.condition!.acknowledgedByName ?? null,
      acknowledgedAt: p.condition!.acknowledgedAt?.toDate() ?? null,
    })),
    careNotes: handover.careNotes ?? '',
    attachments: (handover.attachments ?? []).map((a) => a.name),
    inviteLink: `${appUrl.value()}/c?invite=1`,
  };
  const pdf = await renderHandoverPdf(content);
  const path = `projects/${projectId}/handover/handover-v${version}.pdf`;
  await bucket().file(path).save(pdf, { contentType: 'application/pdf' });

  const record = { path, version, generatedAt: Timestamp.fromDate(now) };
  await handoverRef(projectId).set(
    {
      pdf: record,
      versions: FieldValue.arrayUnion(record),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  if (project.status === 'active')
    await changeProjectStatus(caller, { projectId, status: 'completed' });
  await db.collection(`projects/${projectId}/posts`).add({
    type: 'system',
    authorUid: caller.uid,
    authorName: project.branding.name,
    authorRole: caller.role,
    text: '',
    media: [],
    visibility: 'all',
    milestone: null,
    system: { event: 'handover_ready', version },
    commentCount: 0,
    unanswered: false,
    createdAt: FieldValue.serverTimestamp(),
    editedAt: null,
    deletedAt: null,
  });
  await tellClients(projectId, project, version);
  return { path, version };
}

/** "Your handover pack from Ek & Lind is ready" by text and email, at once (PRD section 6). */
async function tellClients(projectId: string, project: Project, version: number): Promise<void> {
  for (const uid of project.clientUids) {
    const user = (await db.doc(`users/${uid}`).get()).data() as UserDoc | undefined;
    if (!user) continue;
    for (const channel of ['sms', 'email'] as const) {
      const to = channel === 'sms' ? user.phoneE164 : user.email;
      if (!to) continue;
      await queueMessage(db, {
        channel,
        to: { uid, phone: user.phoneE164, email: user.email },
        recipientKind: 'client',
        immediate: true,
        template: 'handoverReady',
        params: {
          firm: project.branding.name,
          project: project.title,
          link: `${appUrl.value()}/c/${projectId}/handover`,
          settingsPath: '/c/settings',
        },
        locale: user.locale,
        companyId: project.companyId,
        projectId,
        dedupeKey: `handover:${projectId}:${version}:${uid}:${channel}`,
      });
    }
  }
}

/** A condition check-in (F12, from Solo): photos with a note and place each, for clients. */
export async function postConditionReportHandler(request: CallableRequest<unknown>) {
  const input = parseInput(postConditionInput, request.data);
  const caller = requireStaff(request);
  const project = await loadProject(input.projectId);
  assertProjectStaff(caller, project);
  if (!(await features(project.companyId)).features.conditionCheckIn)
    throw new HttpsError('failed-precondition', 'plan_feature');
  if (input.items.some((i) => i.mediaIndex >= input.media.length))
    throw new HttpsError('invalid-argument', 'invalid_input');
  const author = (await db.doc(`users/${caller.uid}`).get()).get('name') as string;
  const condition: ConditionReport = { items: input.items, acknowledgedAt: null, approvalId: null };
  const ref = await db.collection(`projects/${input.projectId}/posts`).add({
    type: 'condition',
    authorUid: caller.uid,
    authorName: author ?? '',
    authorRole: caller.role,
    text: input.text,
    media: input.media.map((m): Media => ({
      ...m,
      tags: [...new Set([...m.tags, 'condition' as const])],
    })),
    visibility: 'all',
    milestone: null,
    condition,
    commentCount: 0,
    unanswered: false,
    createdAt: FieldValue.serverTimestamp(),
    editedAt: null,
    deletedAt: null,
  });
  return { postId: ref.id };
}

/**
 * A client acknowledges a condition check-in with one tap (F12). Like an approval, it writes a
 * record once, with a snapshot of exactly what was shown.
 */
export async function acknowledgeConditionHandler(request: CallableRequest<unknown>) {
  const caller = requireAuth(request);
  const input = parseInput(postRefInput, request.data);
  const project = await loadProject(input.projectId);
  if (!caller.isClient || !project.clientUids.includes(caller.uid))
    throw new HttpsError('permission-denied', 'clients_only');
  const member = (
    await db.doc(`projects/${input.projectId}/members/${caller.uid}`).get()
  ).data() as ProjectMember | undefined;
  const postRef = db.doc(`projects/${input.projectId}/posts/${input.postId}`);
  const approvalRef = db.doc(`projects/${input.projectId}/approvals/${input.postId}_ack`);
  await db
    .runTransaction(async (tx) => {
      const post = (await tx.get(postRef)).data() as Post | undefined;
      if (post?.type !== 'condition' || !post.condition)
        throw new HttpsError('not-found', 'post_not_found');
      if (post.condition.acknowledgedAt) throw new HttpsError('already-exists', 'already_answered');
      const snapshot = {
        projectTitle: project.title,
        items: post.condition.items,
        media: post.media.map((m) => m.path),
        text: post.text,
      };
      const approval: Approval<FieldValue> = {
        postId: input.postId,
        version: 1,
        kind: 'condition',
        outcome: 'acknowledged',
        optionId: null,
        priceOre: null,
        reason: null,
        snapshot: snapshot as never,
        snapshotSha256: sha256Hex(JSON.stringify(snapshot)),
        actorUid: caller.uid,
        actorName: member?.name ?? '',
        actorPhoneMasked: member?.phoneMasked ?? null,
        phoneVerified: false,
        createdAt: FieldValue.serverTimestamp(),
      };
      tx.create(approvalRef, approval);
      tx.update(postRef, {
        'condition.acknowledgedAt': FieldValue.serverTimestamp(),
        'condition.acknowledgedByName': approval.actorName,
        'condition.approvalId': approvalRef.id,
      });
    })
    .catch((error: unknown) => {
      if ((error as { code?: number }).code === 6)
        throw new HttpsError('already-exists', 'already_answered');
      throw error;
    });
  return { approvalId: approvalRef.id };
}

/** 09:00 Stockholm on the date; a yearly reminder whose date has passed moves to next year. */
export function nextSendAt(
  dueDate: string,
  repeat: 'none' | 'yearly',
  now = new Date(),
): Date | null {
  const [year, month, day] = dueDate.split('-').map(Number) as [number, number, number];
  for (let y = year; y <= year + 100; y++) {
    const at = zonedTimeToUtc({ year: y, month, day, hour: 9, minute: 0 });
    if (at.getTime() > now.getTime()) return at;
    if (repeat === 'none') return null;
  }
  return null;
}

async function aftercareManager(request: CallableRequest<unknown>, projectId: string) {
  const { caller, project } = await managerOf(request, projectId);
  if (!(await features(project.companyId)).features.aftercare)
    throw new HttpsError('failed-precondition', 'plan_feature');
  return { caller, project };
}

/** Adds or changes an aftercare reminder (F13, from Team). */
export async function saveReminderHandler(request: CallableRequest<unknown>) {
  const input = parseInput(saveReminderInput, request.data);
  await aftercareManager(request, input.projectId);
  const at = nextSendAt(input.dueDate, input.repeat);
  if (!at) throw new HttpsError('invalid-argument', 'date_in_past');
  const collection = db.collection(`projects/${input.projectId}/reminders`);
  const ref = input.reminderId ? collection.doc(input.reminderId) : collection.doc();
  const reminder: Omit<Reminder<Timestamp | FieldValue>, 'createdAt'> = {
    title: input.title,
    note: input.note,
    dueDate: input.dueDate,
    repeat: input.repeat,
    nextSendAt: Timestamp.fromDate(at),
    active: true,
  };
  await ref.set(
    input.reminderId ? reminder : { ...reminder, createdAt: FieldValue.serverTimestamp() },
    {
      merge: true,
    },
  );
  return { reminderId: ref.id };
}

export async function deleteReminderHandler(request: CallableRequest<unknown>) {
  const input = parseInput(reminderRefInput, request.data);
  await managerOf(request, input.projectId);
  await db.doc(`projects/${input.projectId}/reminders/${input.reminderId}`).delete();
  return { ok: true };
}

/** "Book {firm} again" (F13): a booking request for the firm, who hears by email at once. */
export async function requestBookingHandler(request: CallableRequest<unknown>) {
  const caller = requireAuth(request);
  const input = parseInput(requestBookingInput, request.data);
  const project = await loadProject(input.projectId);
  if (!caller.isClient || !project.clientUids.includes(caller.uid))
    throw new HttpsError('permission-denied', 'clients_only');
  const name =
    ((await db.doc(`projects/${input.projectId}/members/${caller.uid}`).get()).get(
      'name',
    ) as string) ?? '';
  const booking: BookingRequest<FieldValue> = {
    reminderId: input.reminderId ?? null,
    clientUid: caller.uid,
    clientName: name,
    note: input.note,
    status: 'open',
    createdAt: FieldValue.serverTimestamp(),
  };
  const ref = await db.collection(`projects/${input.projectId}/bookingRequests`).add(booking);
  for (const staff of await projectStaff(db, project)) {
    if (staff.role === 'crew') continue;
    const message = {
      recipientKind: 'staff' as const,
      template: 'bookingRequest' as const,
      params: { client: name, project: project.title, link: `${appUrl.value()}/app` },
      locale: staff.locale,
      companyId: project.companyId,
      projectId: input.projectId,
      dedupeKey: `booking:${ref.id}:${staff.uid}`,
    };
    if (staff.wantsPush) await queuePush(db, { ...message, to: { uid: staff.uid } });
    if (!staff.email || !staff.wantsEmail) continue;
    await queueMessage(db, {
      ...message,
      channel: 'email',
      to: { uid: staff.uid, email: staff.email },
    });
  }
  return { requestId: ref.id };
}

/** Staff mark a booking request as handled; it leaves the Today list. */
export async function resolveBookingHandler(request: CallableRequest<unknown>) {
  const input = parseInput(bookingRefInput, request.data);
  const caller: StaffCaller = requireStaff(request);
  const project = await loadProject(input.projectId);
  assertProjectStaff(caller, project);
  await db
    .doc(`projects/${input.projectId}/bookingRequests/${input.requestId}`)
    .update({ status: 'handled' });
  return { ok: true };
}

export const saveHandover = onCall(callableOptions, saveHandoverHandler);
export const generateHandover = onCall(
  { ...callableOptions, timeoutSeconds: 120, memory: '1GiB' },
  generateHandoverHandler,
);
export const postConditionReport = onCall(callableOptions, postConditionReportHandler);
export const acknowledgeCondition = onCall(callableOptions, acknowledgeConditionHandler);
export const saveReminder = onCall(callableOptions, saveReminderHandler);
export const deleteReminder = onCall(callableOptions, deleteReminderHandler);
export const requestBooking = onCall(callableOptions, requestBookingHandler);
export const resolveBooking = onCall(callableOptions, resolveBookingHandler);

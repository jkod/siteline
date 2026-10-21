import { Timestamp } from 'firebase-admin/firestore';

import {
  createServiceClientHandler,
  postVisitReportHandler,
  requestVisitChangeHandler,
  respondVisitChangeHandler,
  setPhotoConsentHandler,
} from '../../functions/src/callables/visits';
import { generateAllVisits } from '../../functions/src/scheduled/notifications';
import { handlePostWritten } from '../../functions/src/triggers/posts';
import { handleVisitWritten } from '../../functions/src/triggers/visits';
import {
  companyWithOwner,
  db,
  failure,
  outbox,
  request,
  resetEmulators,
  type TestCaller,
} from './harness';

beforeEach(resetEmulators);

async function tutorWithClient(weekdays = ['TU']) {
  const tutor = await companyWithOwner('c2', 'karin', 'visits');
  const start = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const { projectId } = await createServiceClientHandler(
    request(tutor, {
      title: 'Matte med Elsa',
      clientName: 'Anna Lindqvist',
      clientPhone: '070-174 06 05',
      trade: 'tutoring',
      schedule: { interval: 1, weekdays, startDate: start, time: '15:00', durationMinutes: 60 },
    }),
  );
  const project = (await db.doc(`projects/${projectId}`).get()).data()!;
  const client: TestCaller = { uid: project['clientUids'][0], token: { kind: 'client' } };
  return { tutor, projectId, client };
}

const visits = async (projectId: string) =>
  (await db.collection(`projects/${projectId}/visits`).orderBy('startAt').get()).docs;

describe('service clients', () => {
  it('creates the client, the schedule, the link and eight weeks of visits', async () => {
    const { projectId } = await tutorWithClient();
    const project = (await db.doc(`projects/${projectId}`).get()).data()!;
    expect(project).toMatchObject({
      kind: 'service',
      templateId: 'tutoring',
      photoConsentAt: null,
    });
    expect(project['schedule'].rrule).toContain('FREQ=WEEKLY');
    const list = await visits(projectId);
    expect(list.length).toBeGreaterThanOrEqual(7);
    expect(list.length).toBeLessThanOrEqual(9);
    expect(list.every((v) => v.id.startsWith('s-') && v.get('fromSchedule') === true)).toBe(true);
    expect((await db.doc('companies/c2').get()).get('usage.serviceClients')).toBe(1);
    expect((await outbox()).filter((m) => m.template === 'clientInvite')).toHaveLength(1);
  });

  it('never recreates a moved or cancelled visit, and leaves the rest of the series alone (PRD F19)', async () => {
    const { projectId } = await tutorWithClient();
    const [first, second] = await visits(projectId);
    const moved = Timestamp.fromMillis(first!.get('startAt').toMillis() + 2 * 3600_000);
    await first!.ref.update({ startAt: moved });
    await second!.ref.update({ status: 'cancelled' });
    const before = (await visits(projectId)).length;
    expect(await generateAllVisits(db)).toBe(0);
    const after = await visits(projectId);
    expect(after).toHaveLength(before);
    expect(
      after
        .find((v) => v.id === first!.id)!
        .get('startAt')
        .toMillis(),
    ).toBe(moved.toMillis());
    expect(after.find((v) => v.id === second!.id)!.get('status')).toBe('cancelled');
  });

  it('lets the client ask to move one visit and staff accept with another time', async () => {
    const { tutor, client, projectId } = await tutorWithClient();
    const [first, second] = await visits(projectId);
    const proposed = new Date(first!.get('startAt').toMillis() + 86_400_000).toISOString();
    const { requestId } = await requestVisitChangeHandler(
      request(client, {
        projectId,
        visitId: first!.id,
        kind: 'move',
        proposedStartAt: proposed,
        note: 'Elsa har prov',
      }),
    );
    expect(
      (await outbox()).filter((m) => m.template === 'visitChangeRequested').map((m) => m.to.uid),
    ).toEqual(['karin']);

    const suggested = new Date(first!.get('startAt').toMillis() + 2 * 86_400_000);
    await respondVisitChangeHandler(
      request(tutor, { projectId, requestId, accept: true, startAt: suggested.toISOString() }),
    );
    const updated = (await first!.ref.get()).data()!;
    expect(updated['startAt'].toMillis()).toBe(suggested.getTime());
    expect(updated['endAt'].toMillis() - updated['startAt'].toMillis()).toBe(3600_000);
    expect((await second!.ref.get()).get('startAt').toMillis()).toBe(
      second!.get('startAt').toMillis(),
    );
    expect(
      (await db.doc(`projects/${projectId}/visitRequests/${requestId}`).get()).get('status'),
    ).toBe('accepted');
    expect(
      (
        await failure(
          respondVisitChangeHandler(request(tutor, { projectId, requestId, accept: false })),
        )
      ).message,
    ).toBe('request_not_open');
  });

  it('tells the client when a request is declined', async () => {
    const { tutor, client, projectId } = await tutorWithClient();
    const [first] = await visits(projectId);
    const { requestId } = await requestVisitChangeHandler(
      request(client, { projectId, visitId: first!.id, kind: 'cancel' }),
    );
    await respondVisitChangeHandler(request(tutor, { projectId, requestId, accept: false }));
    expect((await first!.ref.get()).get('status')).toBe('planned');
    expect((await outbox()).filter((m) => m.template === 'visitChangeDeclined')).toHaveLength(1);
  });

  it('sends a report: the visit is done, next-time items go to the next visit, the client is told at once', async () => {
    const { tutor, projectId } = await tutorWithClient();
    const [first, second] = await visits(projectId);
    const { postId } = await postVisitReportHandler(
      request(tutor, {
        projectId,
        visitId: first!.id,
        done: [{ itemId: 'topics', label: 'Gick igenom dagens moment', checked: true }],
        rating: 'good',
        note: 'Ekvationer med en okänd.',
        nextTime: ['Öva på sidan 42'],
      }),
    );
    const report = await db.doc(`projects/${projectId}/posts/${postId}`).get();
    expect(report.data()).toMatchObject({
      type: 'visit_report',
      visibility: 'all',
      report: { visitId: first!.id, rating: 'good', templateId: 'tutoring' },
    });
    expect((await first!.ref.get()).data()).toMatchObject({ status: 'done', reportPostId: postId });
    const items = await db.collection(`projects/${projectId}/checklist`).get();
    expect(items.docs.map((d) => d.data())).toEqual([
      expect.objectContaining({ text: 'Öva på sidan 42', side: 'client', visitId: second!.id }),
    ]);
    expect(
      (
        await failure(
          postVisitReportHandler(request(tutor, { projectId, visitId: first!.id, done: [] })),
        )
      ).message,
    ).toBe('already_reported');

    await handlePostWritten(db, projectId, postId, undefined, report);
    const texts = (await outbox()).filter((m) => m.template === 'visitReport');
    expect(texts).toHaveLength(1);
    expect(texts[0]!.channel).toBe('sms');
  });

  it('keeps photos out of tutoring reports until a parent consents (PRD section 10)', async () => {
    const { tutor, projectId } = await tutorWithClient();
    const [first] = await visits(projectId);
    const media = [
      {
        path: `projects/${projectId}/media/m/display.jpg`,
        thumbPath: `projects/${projectId}/media/m/thumb.jpg`,
        width: 1,
        height: 1,
        tags: [],
      },
    ];
    expect(
      (
        await failure(
          postVisitReportHandler(
            request(tutor, { projectId, visitId: first!.id, done: [], media }),
          ),
        )
      ).message,
    ).toBe('photos_need_consent');
    await setPhotoConsentHandler(request(tutor, { projectId, consent: true }));
    await expect(
      postVisitReportHandler(request(tutor, { projectId, visitId: first!.id, done: [], media })),
    ).resolves.toHaveProperty('postId');
  });
});

describe('onVisitWritten', () => {
  async function projectWithVisits() {
    await companyWithOwner('c1', 'erik', 'team');
    await db
      .doc('users/anna')
      .set({ kind: 'client', name: 'Anna', phoneE164: '+46701740605', email: null, locale: 'sv' });
    await db.doc('projects/p1').set({
      companyId: 'c1',
      title: 'Kök',
      clientUids: ['anna'],
      crewUids: [],
      nextVisitId: null,
      branding: { name: 'Ek & Lind' },
    });
    const now = new Date('2026-11-02T08:00:00Z');
    const visit = (day: number) => ({
      companyId: 'c1',
      startAt: Timestamp.fromDate(new Date(`2026-11-${String(day).padStart(2, '0')}T06:30:00Z`)),
      endAt: null,
      status: 'planned',
      fromSchedule: false,
      notes: '',
      people: null,
    });
    await db.doc('projects/p1/visits/v1').set(visit(3));
    await db.doc('projects/p1/visits/v2').set(visit(10));
    await db
      .doc('projects/p1/checklist/open')
      .set({ text: 'Flytta bilen', side: 'client', visitId: 'v1', doneAt: null });
    await db
      .doc('projects/p1/checklist/done')
      .set({ text: 'Klart', side: 'client', visitId: 'v1', doneAt: Timestamp.now() });
    return now;
  }

  it('keeps the next visit current and moves unfinished items on when a visit is done (PRD F7)', async () => {
    const now = await projectWithVisits();
    const ref = db.doc('projects/p1/visits/v1');
    const before = await ref.get();
    await handleVisitWritten(db, 'p1', 'v1', undefined, before, now);
    expect((await db.doc('projects/p1').get()).get('nextVisitId')).toBe('v1');

    await ref.update({ status: 'done' });
    await handleVisitWritten(db, 'p1', 'v1', before, await ref.get(), now);
    expect((await db.doc('projects/p1').get()).get('nextVisitId')).toBe('v2');
    expect((await db.doc('projects/p1/checklist/open').get()).get('visitId')).toBe('v2');
    expect((await db.doc('projects/p1/checklist/done').get()).get('visitId')).toBe('v1');
  });

  it('tells clients at once when a visit is added, moved or cancelled', async () => {
    const now = await projectWithVisits();
    const ref = db.doc('projects/p1/visits/v2');
    const added = await ref.get();
    await handleVisitWritten(db, 'p1', 'v2', undefined, added, now);
    await ref.update({ startAt: Timestamp.fromDate(new Date('2026-11-11T06:30:00Z')) });
    const moved = await ref.get();
    await handleVisitWritten(db, 'p1', 'v2', added, moved, now);
    await ref.update({ status: 'cancelled' });
    await handleVisitWritten(db, 'p1', 'v2', moved, await ref.get(), now);
    const templates = (await outbox()).map((m) => m.template).sort();
    expect(templates).toEqual(['visitCancelled', 'visitChanged', 'visitChanged']);
    expect((await outbox()).find((m) => m.template === 'visitCancelled')!.params['when']).toBe(
      'ons 11 nov. kl. 07:30',
    );
  });
});

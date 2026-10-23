import { Timestamp } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

import { inviteClientHandler } from '../../functions/src/callables/clients';
import {
  respondToDecisionHandler,
  saveDecisionDraftHandler,
  sendDecisionHandler,
} from '../../functions/src/callables/decisions';
import {
  acknowledgeConditionHandler,
  generateHandoverHandler,
  nextSendAt,
  postConditionReportHandler,
  requestBookingHandler,
  resolveBookingHandler,
  saveHandoverHandler,
  saveReminderHandler,
} from '../../functions/src/callables/handover';
import { createProjectHandler } from '../../functions/src/callables/projects';
import { bucket } from '../../functions/src/lib/admin';
import { assetPath } from '../../functions/src/lib/assets';
import { sendAftercareReminders } from '../../functions/src/scheduled/maintenance';
import {
  addStaff,
  companyWithOwner,
  db,
  failure,
  outbox,
  request,
  resetEmulators,
  signedInUser,
  type TestCaller,
} from './harness';

beforeEach(resetEmulators);

const reason = async (p: Promise<unknown>) => (await failure(p)).message;
const jpeg = readFileSync(assetPath('photos/el-thumb.jpg'));

async function photo(projectId: string, id: string, tags: string[] = []) {
  const base = `projects/${projectId}/media/${id}`;
  await bucket().file(`${base}/display.jpg`).save(jpeg, { contentType: 'image/jpeg' });
  await bucket().file(`${base}/thumb.jpg`).save(jpeg, { contentType: 'image/jpeg' });
  return {
    path: `${base}/display.jpg`,
    thumbPath: `${base}/thumb.jpg`,
    width: 640,
    height: 480,
    tags,
  };
}

async function setup(plan: 'free' | 'solo' | 'team' = 'team') {
  const owner = await companyWithOwner('c1', 'erik', plan);
  const { projectId } = await createProjectHandler(request(owner, { title: 'Kök Lindqvist' }));
  const { uid } = await inviteClientHandler(
    request(owner, {
      projectId,
      name: 'Anna Lindqvist',
      phone: '0701740605',
      email: 'anna@example.com',
    }),
  );
  const anna: TestCaller = { uid, token: { kind: 'client' } };
  return { owner, anna, projectId };
}

describe('the handover pack (F9)', () => {
  it('is edited by owners and admins only', async () => {
    const { projectId } = await setup();
    await addStaff('c1', 'omar', 'crew', 'Omar');
    const crew = await signedInUser('omar', 'omar@example.com', { cid: 'c1', crole: 'crew' });
    const input = {
      projectId,
      summary: 'Klart',
      beforeAfter: [],
      materials: [],
      careNotes: '',
      attachments: [],
    };
    expect(await reason(saveHandoverHandler(request(crew, input)))).toBe('not_on_project');
  });

  it('builds a versioned PDF with every approved extra, completes the project and tells the client', async () => {
    const { owner, anna, projectId } = await setup();
    const { postId } = await saveDecisionDraftHandler(
      request(owner, {
        projectId,
        decision: { kind: 'extra_work', title: 'Byt golvbjälke', priceOre: 650_000 },
      }),
    );
    await sendDecisionHandler(request(owner, { projectId, postId }));
    await respondToDecisionHandler(
      request(anna, { projectId, postId, version: 1, outcome: 'approved' }),
    );
    await db.collection(`projects/${projectId}/posts`).add({
      type: 'update',
      authorUid: 'erik',
      authorName: 'Erik Ek',
      authorRole: 'owner',
      text: 'Nya rör innan väggen stängs.',
      media: [await photo(projectId, 'm1', ['hidden_work'])],
      visibility: 'all',
      createdAt: Timestamp.now(),
      deletedAt: null,
    });
    await saveHandoverHandler(
      request(owner, {
        projectId,
        summary: 'Köket är klart.',
        beforeAfter: [
          {
            before: await photo(projectId, 'b1'),
            after: await photo(projectId, 'a1'),
            caption: 'Diskbänken',
          },
        ],
        materials: [
          {
            name: 'Bänkskiva',
            brand: 'Nordic',
            colourCode: 'Ek',
            supplier: 'Byggmax',
            warrantyYears: 5,
          },
        ],
        careNotes: 'Olja bänken.',
        attachments: [],
      }),
    );

    const first = await generateHandoverHandler(request(owner, { projectId }));
    expect(first).toEqual({ path: `projects/${projectId}/handover/handover-v1.pdf`, version: 1 });
    const [bytes] = await bucket().file(first.path).download();
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await db.doc(`projects/${projectId}`).get()).get('status')).toBe('completed');
    const handover = (await db.doc(`projects/${projectId}/handover/current`).get()).data()!;
    expect(handover['pdf'].version).toBe(1);
    const system = await db
      .collection(`projects/${projectId}/posts`)
      .where('type', '==', 'system')
      .get();
    expect(system.docs[0]!.get('system')).toEqual({ event: 'handover_ready', version: 1 });
    const told = (await outbox()).filter((m) => m.template === 'handoverReady');
    expect(told.map((m) => m.channel).sort()).toEqual(['email', 'sms']);

    const second = await generateHandoverHandler(request(owner, { projectId }));
    expect(second.version).toBe(2);
    expect(
      (await db.doc(`projects/${projectId}/handover/current`).get()).get('versions'),
    ).toHaveLength(2);
  });

  it('makes the pack for a project with 200 photos in under 60 seconds', async () => {
    const { owner, projectId } = await setup();
    const batch = db.batch();
    for (let i = 0; i < 200; i++) {
      const media = await photo(projectId, `h${i}`, ['hidden_work']);
      batch.set(db.collection(`projects/${projectId}/posts`).doc(), {
        type: 'update',
        authorUid: 'erik',
        authorName: 'Erik Ek',
        authorRole: 'owner',
        text: `Rör ${i + 1}`,
        media: [media],
        visibility: 'all',
        createdAt: Timestamp.fromMillis(Date.now() - i * 60_000),
        deletedAt: null,
      });
    }
    await batch.commit();
    const started = Date.now();
    await generateHandoverHandler(request(owner, { projectId }));
    expect(Date.now() - started).toBeLessThan(60_000);
  }, 180_000);
});

describe('condition check-in (F12)', () => {
  it('is a Solo feature', async () => {
    const { owner, projectId } = await setup('free');
    const media = [await photo(projectId, 'c1')];
    const input = {
      projectId,
      media,
      items: [{ mediaIndex: 0, note: 'Repa', location: 'Hallgolvet' }],
    };
    expect(await reason(postConditionReportHandler(request(owner, input)))).toBe('plan_feature');
  });

  it('is acknowledged once by a client, with a record like an approval', async () => {
    const { owner, anna, projectId } = await setup('solo');
    const media = [await photo(projectId, 'c1')];
    const { postId } = await postConditionReportHandler(
      request(owner, {
        projectId,
        media,
        items: [{ mediaIndex: 0, note: 'Repa', location: 'Hallgolvet' }],
      }),
    );
    expect(
      (await db.doc(`projects/${projectId}/posts/${postId}`).get()).get('media')[0].tags,
    ).toEqual(['condition']);
    expect(await reason(acknowledgeConditionHandler(request(owner, { projectId, postId })))).toBe(
      'clients_only',
    );
    await acknowledgeConditionHandler(request(anna, { projectId, postId }));
    const post = (await db.doc(`projects/${projectId}/posts/${postId}`).get()).data()!;
    expect(post['condition']).toMatchObject({
      acknowledgedByName: 'Anna Lindqvist',
      approvalId: `${postId}_ack`,
    });
    expect(
      (await db.doc(`projects/${projectId}/approvals/${postId}_ack`).get()).data(),
    ).toMatchObject({
      kind: 'condition',
      outcome: 'acknowledged',
      actorName: 'Anna Lindqvist',
    });
    expect(await reason(acknowledgeConditionHandler(request(anna, { projectId, postId })))).toBe(
      'already_answered',
    );
  });
});

describe('aftercare reminders and booking requests (F13)', () => {
  it('sends at 09:00 Stockholm, moving yearly ones on and ending the others', async () => {
    expect(nextSendAt('2027-05-01', 'none', new Date('2026-11-01T00:00:00Z'))).toEqual(
      new Date('2027-05-01T07:00:00Z'),
    );
    expect(nextSendAt('2026-05-01', 'yearly', new Date('2026-11-01T00:00:00Z'))).toEqual(
      new Date('2027-05-01T07:00:00Z'),
    );
    expect(nextSendAt('2026-05-01', 'none', new Date('2026-11-01T00:00:00Z'))).toBeNull();
  });

  it('is a Team feature, and past one-off dates are refused', async () => {
    const solo = await setup('solo');
    const input = {
      projectId: solo.projectId,
      title: 'Olja bänken',
      dueDate: '2030-05-01',
      repeat: 'yearly',
    };
    expect(await reason(saveReminderHandler(request(solo.owner, input)))).toBe('plan_feature');
    await resetEmulators();
    const team = await setup('team');
    expect(
      await reason(
        saveReminderHandler(
          request(team.owner, {
            ...input,
            projectId: team.projectId,
            dueDate: '2020-01-01',
            repeat: 'none',
          }),
        ),
      ),
    ).toBe('date_in_past');
  });

  it('reaches clients who want it, and a booking request reaches the firm', async () => {
    const { owner, anna, projectId } = await setup('team');
    const { reminderId } = await saveReminderHandler(
      request(owner, {
        projectId,
        title: 'Olja bänken',
        note: 'Två gånger om året.',
        dueDate: '2030-05-01',
        repeat: 'yearly',
      }),
    );
    const day = new Date('2030-05-01T07:00:00Z');
    expect(await sendAftercareReminders(db, new Date(day.getTime() - 60_000))).toBe(0);
    expect(await sendAftercareReminders(db, day)).toBe(1);
    const [message] = (await outbox()).filter((m) => m.template === 'aftercareReminder');
    expect(message!.params['link']).toBe(
      `http://localhost:4300/c/${projectId}/handover?book=${reminderId}`,
    );
    const reminder = (await db.doc(`projects/${projectId}/reminders/${reminderId}`).get()).data()!;
    expect((reminder['nextSendAt'] as Timestamp).toDate()).toEqual(
      new Date('2031-05-01T07:00:00Z'),
    );

    await db.doc(`projects/${projectId}/members/${anna.uid}`).update({ 'notify.aftercare': false });
    expect(await sendAftercareReminders(db, new Date('2031-05-01T07:00:00Z'))).toBe(0);

    const { requestId } = await requestBookingHandler(
      request(anna, { projectId, reminderId, note: 'I maj?' }),
    );
    expect(
      (await db.doc(`projects/${projectId}/bookingRequests/${requestId}`).get()).data(),
    ).toMatchObject({
      clientName: 'Anna Lindqvist',
      status: 'open',
      reminderId,
    });
    expect((await outbox()).filter((m) => m.template === 'bookingRequest')).toHaveLength(1);
    await resolveBookingHandler(request(owner, { projectId, requestId }));
    expect(
      (await db.doc(`projects/${projectId}/bookingRequests/${requestId}`).get()).get('status'),
    ).toBe('handled');
  });
});

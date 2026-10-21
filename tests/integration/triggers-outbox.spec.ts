import { Timestamp } from 'firebase-admin/firestore';

import type { EmailSender, SmsSender } from '../../functions/src/adapters/types';
import { deliver } from '../../functions/src/lib/delivery';
import { queueMessage } from '../../functions/src/lib/outbox';
import { sweepOutbox } from '../../functions/src/scheduled/outbox-sweeper';
import { handleCommentWritten } from '../../functions/src/triggers/comments';
import { handlePostWritten } from '../../functions/src/triggers/posts';
import { addStaff, companyWithOwner, db, outbox, resetEmulators } from './harness';

beforeEach(resetEmulators);

async function projectWithClient() {
  await companyWithOwner('c1', 'erik', 'team');
  await addStaff('c1', 'omar', 'crew', 'Omar');
  await addStaff('c1', 'nils', 'crew', 'Nils');
  await db.doc('users/anna').set({
    kind: 'client',
    name: 'Anna Lindqvist',
    phoneE164: '+46701740605',
    email: null,
    locale: 'sv',
  });
  await db.doc('projects/p1').set({
    companyId: 'c1',
    title: 'Köksrenovering Lindqvist',
    branding: {
      name: 'Ek & Lind Snickeri',
      logoUrl: null,
      accentColor: '#127A69',
      showSitelineFooter: false,
    },
    crewUids: ['omar'],
    clientUids: ['anna'],
    roles: { omar: 'crew', anna: 'client' },
    totals: { approvedExtraWorkOre: 0, openDecisions: 0, unansweredQuestions: 0 },
    lastPostAt: null,
  });
}

async function write(path: string, data: Record<string, unknown>) {
  const ref = db.doc(path);
  const before = await ref.get();
  await ref.set(data, { merge: true });
  return { before, after: await ref.get() };
}

const question = {
  type: 'question',
  authorUid: 'anna',
  authorName: 'Anna Lindqvist',
  authorRole: 'client',
  text: 'När kommer elektrikern?',
  media: [],
  unanswered: true,
  commentCount: 0,
  createdAt: Timestamp.now(),
  deletedAt: null,
};

describe('posts and comments', () => {
  it('counts an unanswered question, notifies owners and assigned crew, and clears on a staff reply', async () => {
    await projectWithClient();
    const posted = await write('projects/p1/posts/q1', question);
    await handlePostWritten(db, 'p1', 'q1', posted.before, posted.after);
    expect((await db.doc('projects/p1').get()).get('totals.unansweredQuestions')).toBe(1);
    expect((await db.doc('projects/p1').get()).get('lastPostAt')).toBeTruthy();

    const emails = (await outbox()).filter((m) => m.template === 'clientQuestion');
    expect(emails.map((m) => m.to.uid).sort()).toEqual(['erik', 'omar']);
    // A retried trigger queues nothing new.
    await handlePostWritten(db, 'p1', 'q1', posted.before, posted.after);
    expect((await outbox()).filter((m) => m.template === 'clientQuestion')).toHaveLength(2);

    const ids = { projectId: 'p1', postId: 'q1', commentId: 'c1' };
    const reply = await write('projects/p1/posts/q1/comments/c1', {
      authorUid: 'omar',
      authorName: 'Omar',
      authorRole: 'crew',
      text: 'På torsdag.',
      deletedAt: null,
    });
    await handleCommentWritten(db, ids, reply.before, reply.after);
    const post = (await db.doc('projects/p1/posts/q1').get()).data()!;
    expect(post['unanswered']).toBe(false);
    expect(post['commentCount']).toBe(1);
    expect((await db.doc('projects/p1').get()).get('totals.unansweredQuestions')).toBe(0);
    const texts = (await outbox()).filter((m) => m.template === 'staffReply');
    expect(texts).toHaveLength(1);
    expect(texts[0]!.to.phone).toBe('+46701740605');
  });

  it('texts a client at most once per project every two hours', async () => {
    await projectWithClient();
    await write('projects/p1/posts/q1', question);
    const start = Date.UTC(2026, 9, 21, 10, 0);
    for (const [i, offset] of [0, 30, 90].entries()) {
      const c = await write(`projects/p1/posts/q1/comments/c${i}`, {
        authorUid: 'erik',
        authorName: 'Erik Ek',
        authorRole: 'owner',
        text: 'Svar',
        deletedAt: null,
      });
      await handleCommentWritten(
        db,
        { projectId: 'p1', postId: 'q1', commentId: `c${i}` },
        c.before,
        c.after,
        start + offset * 60_000,
      );
    }
    expect((await outbox()).filter((m) => m.template === 'staffReply')).toHaveLength(1);
    const later = await write('projects/p1/posts/q1/comments/c9', {
      authorUid: 'erik',
      authorName: 'Erik Ek',
      authorRole: 'owner',
      text: 'Svar',
      deletedAt: null,
    });
    await handleCommentWritten(
      db,
      { projectId: 'p1', postId: 'q1', commentId: 'c9' },
      later.before,
      later.after,
      start + 125 * 60_000,
    );
    expect((await outbox()).filter((m) => m.template === 'staffReply')).toHaveLength(2);
  });

  it('emails staff when a client comments', async () => {
    await projectWithClient();
    await write('projects/p1/posts/u1', {
      ...question,
      type: 'update',
      authorUid: 'erik',
      authorRole: 'owner',
      unanswered: false,
    });
    const c = await write('projects/p1/posts/u1/comments/c1', {
      authorUid: 'anna',
      authorName: 'Anna Lindqvist',
      authorRole: 'client',
      text: 'Snyggt!',
      deletedAt: null,
    });
    await handleCommentWritten(
      db,
      { projectId: 'p1', postId: 'u1', commentId: 'c1' },
      c.before,
      c.after,
    );
    expect(
      (await outbox())
        .filter((m) => m.template === 'clientComment')
        .map((m) => m.to.uid)
        .sort(),
    ).toEqual(['erik', 'omar']);
  });
});

describe('outbox', () => {
  const base = {
    channel: 'sms' as const,
    to: { uid: 'anna', phone: '+46701740605' },
    recipientKind: 'client' as const,
    template: 'staffReply' as const,
    params: { firm: 'Ek & Lind', project: 'Kök', link: 'http://x/c/p1' },
    locale: 'sv' as const,
    companyId: 'c1',
    projectId: 'p1',
  };

  function fakeSenders(fail = false) {
    const sent: string[] = [];
    const sms: SmsSender = {
      send: async (m) => {
        if (fail) throw new Error('provider_down');
        sent.push(m.text);
        return { providerMessageId: `sms-${sent.length}` };
      },
    };
    const email: EmailSender = { send: async () => ({ providerMessageId: 'email-1' }) };
    return { sent, senders: { sms: () => sms, email: () => email } };
  }

  it('never queues the same dedupe key twice', async () => {
    expect(await queueMessage(db, { ...base, dedupeKey: 'k1' })).toBe(true);
    expect(await queueMessage(db, { ...base, dedupeKey: 'k1' })).toBe(false);
    expect(await outbox()).toHaveLength(1);
  });

  it('holds client texts between 21:00 and 07:00 Stockholm time, but not emails to staff', async () => {
    const night = new Date('2026-10-21T20:30:00Z'); // 22:30 in Stockholm
    await queueMessage(db, { ...base, dedupeKey: 'night' }, night);
    await queueMessage(
      db,
      {
        ...base,
        channel: 'email',
        recipientKind: 'staff',
        template: 'clientQuestion',
        to: { uid: 'erik', email: 'e@x' },
        dedupeKey: 'mail',
      },
      night,
    );
    const byKey = Object.fromEntries(
      (await outbox()).map((m) => [m.dedupeKey, m.sendAfter.toDate().toISOString()]),
    );
    expect(byKey['night']).toBe('2026-10-22T05:00:00.000Z');
    expect(byKey['mail']).toBe(night.toISOString());
  });

  it('sends once, even when delivered twice', async () => {
    await queueMessage(db, { ...base, dedupeKey: 'once' }, new Date('2026-10-21T10:00:00Z'));
    const [{ id }] = await outbox();
    const { sent, senders } = fakeSenders();
    await deliver(db, id, senders, new Date('2026-10-21T10:00:01Z'));
    await deliver(db, id, senders, new Date('2026-10-21T10:00:02Z'));
    expect(sent).toEqual(['Ek & Lind har svarat dig om Kök: http://x/c/p1']);
    expect((await db.doc(`outbox/${id}`).get()).data()).toMatchObject({
      status: 'sent',
      providerMessageId: 'sms-1',
      attempts: 1,
    });
  });

  it('retries failures with backoff up to three attempts, then stops', async () => {
    const t0 = new Date('2026-10-21T10:00:00Z');
    await queueMessage(db, { ...base, dedupeKey: 'retry' }, t0);
    const [{ id }] = await outbox();
    const failing = fakeSenders(true);
    await deliver(db, id, failing.senders, t0);
    let doc = (await db.doc(`outbox/${id}`).get()).data()!;
    expect(doc).toMatchObject({ status: 'failed', attempts: 1, error: 'provider_down' });
    expect((doc['nextAttemptAt'] as Timestamp).toMillis() - t0.getTime()).toBe(5 * 60_000);

    // Too early: nothing happens.
    expect(await sweepOutbox(db, failing.senders, new Date(t0.getTime() + 60_000))).toBe(0);
    await sweepOutbox(db, failing.senders, new Date(t0.getTime() + 6 * 60_000));
    await sweepOutbox(db, failing.senders, new Date(t0.getTime() + 30 * 60_000));
    doc = (await db.doc(`outbox/${id}`).get()).data()!;
    expect(doc['attempts']).toBe(3);
    expect(await sweepOutbox(db, failing.senders, new Date(t0.getTime() + 24 * 60 * 60_000))).toBe(
      0,
    );
  });

  it('sends held messages once their time comes', async () => {
    await queueMessage(db, { ...base, dedupeKey: 'held' }, new Date('2026-10-21T20:30:00Z'));
    const { sent, senders } = fakeSenders();
    expect(await sweepOutbox(db, senders, new Date('2026-10-22T04:59:00Z'))).toBe(0);
    expect(await sweepOutbox(db, senders, new Date('2026-10-22T05:00:00Z'))).toBe(1);
    expect(sent).toHaveLength(1);
  });
});

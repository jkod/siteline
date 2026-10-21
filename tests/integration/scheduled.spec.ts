import { Timestamp } from 'firebase-admin/firestore';

import { deliver } from '../../functions/src/lib/delivery';
import { queueBatched, queueMessage } from '../../functions/src/lib/outbox';
import {
  generateAllVisits,
  halfHourSlot,
  sendDigests,
  sendVisitReminders,
} from '../../functions/src/scheduled/notifications';
import { addStaff, companyWithOwner, db, outbox, resetEmulators } from './harness';

beforeEach(resetEmulators);

// Scheduled jobs run with a fixed clock (PRD section 14, M2).
const at = (iso: string) => new Date(iso);

async function setup() {
  await companyWithOwner('c1', 'erik', 'team');
  await addStaff('c1', 'omar', 'crew', 'Omar');
  await db.doc('users/anna').set({
    kind: 'client',
    name: 'Anna',
    phoneE164: '+46701740605',
    email: 'anna@example.com',
    locale: 'sv',
  });
  await db
    .doc('users/bo')
    .set({ kind: 'client', name: 'Bo', phoneE164: '+46701740606', email: null, locale: 'sv' });
  await db.doc('projects/p1').set({
    companyId: 'c1',
    kind: 'project',
    status: 'active',
    title: 'Köksrenovering Lindqvist',
    clientUids: ['anna', 'bo'],
    crewUids: ['omar'],
    branding: { name: 'Ek & Lind' },
  });
  await db
    .doc('projects/p1/members/anna')
    .set({ role: 'client', notify: { instant: false, digest: true, channel: 'sms' } });
  await db
    .doc('projects/p1/members/bo')
    .set({ role: 'client', notify: { instant: false, digest: false, channel: 'sms' } });
}

const post = (iso: string, media = 0, overrides: Record<string, unknown> = {}) => ({
  type: 'update',
  visibility: 'all',
  deletedAt: null,
  createdAt: Timestamp.fromDate(at(iso)),
  media: Array.from({ length: media }, () => ({ path: 'x' })),
  ...overrides,
});

describe('halfHourSlot', () => {
  it('rounds Stockholm time down to the half hour', () => {
    expect(halfHourSlot(at('2026-10-21T16:14:00Z'))).toBe('18:00');
    expect(halfHourSlot(at('2026-10-21T16:44:00Z'))).toBe('18:30');
    expect(halfHourSlot(at('2026-12-21T17:05:00Z'))).toBe('18:00');
  });
});

describe('sendDigests', () => {
  const sixPm = at('2026-10-21T16:05:00Z');

  it("sends one digest per client at the company's digest time, counting today's updates and photos", async () => {
    await setup();
    await db.doc('projects/p1/posts/a').set(post('2026-10-21T07:00:00Z', 3));
    await db.doc('projects/p1/posts/b').set(post('2026-10-21T12:00:00Z', 5));
    await db.doc('projects/p1/posts/c').set(post('2026-10-21T13:00:00Z', 0, { type: 'milestone' }));
    await db.doc('projects/p1/posts/old').set(post('2026-10-20T15:00:00Z', 2));
    await db
      .doc('projects/p1/posts/draft')
      .set(post('2026-10-21T14:00:00Z', 0, { type: 'decision', visibility: 'staff' }));
    expect(await sendDigests(db, sixPm)).toBe(1);
    const [digest] = await outbox();
    expect(digest).toMatchObject({ template: 'digest', to: { uid: 'anna' }, channel: 'sms' });
    expect(digest!.params['summary']).toBe('3 uppdateringar och 8 foton');
    // Running twice in the same slot sends nothing new.
    expect(await sendDigests(db, sixPm)).toBe(0);
  });

  it('sends nothing on a day without posts, or outside the digest time (PRD F8)', async () => {
    await setup();
    await db.doc('projects/p1/posts/old').set(post('2026-10-20T15:00:00Z', 2));
    expect(await sendDigests(db, sixPm)).toBe(0);
    await db.doc('projects/p1/posts/a').set(post('2026-10-21T07:00:00Z'));
    expect(await sendDigests(db, at('2026-10-21T15:05:00Z'))).toBe(0);
    expect(await sendDigests(db, sixPm)).toBe(1);
  });

  it('skips clients who get updates instantly', async () => {
    await setup();
    await db.doc('projects/p1/members/anna').update({ 'notify.instant': true });
    await db.doc('projects/p1/posts/a').set(post('2026-10-21T07:00:00Z'));
    expect(await sendDigests(db, sixPm)).toBe(0);
  });
});

describe('sendVisitReminders', () => {
  const sixPm = at('2026-11-02T17:10:00Z'); // 18:10 CET on Monday 2 November

  async function withVisits() {
    await setup();
    await db.doc('projects/p1/visits/tomorrow').set({
      companyId: 'c1',
      status: 'planned',
      startAt: Timestamp.fromDate(at('2026-11-03T06:30:00Z')),
    });
    await db.doc('projects/p1/visits/later').set({
      companyId: 'c1',
      status: 'planned',
      startAt: Timestamp.fromDate(at('2026-11-05T06:30:00Z')),
    });
    await db.doc('projects/p1/checklist/a').set({
      text: 'Flytta bilen från uppfarten',
      side: 'client',
      visitId: 'tomorrow',
      doneAt: null,
    });
    await db
      .doc('projects/p1/checklist/b')
      .set({ text: 'Ta med kakelfix', side: 'firm', visitId: 'tomorrow', doneAt: null });
    await db
      .doc('projects/p1/checklist/c')
      .set({ text: 'Klart redan', side: 'client', visitId: 'tomorrow', doneAt: Timestamp.now() });
  }

  it("reminds clients and assigned crew of tomorrow's visit, each with their own side (PRD F7)", async () => {
    await withVisits();
    expect(await sendVisitReminders(db, sixPm)).toBe(3);
    const messages = await outbox();
    const anna = messages.find((m) => m.to.uid === 'anna')!;
    expect(anna).toMatchObject({ template: 'visitReminderClient', channel: 'sms' });
    expect(anna.params).toMatchObject({ time: '07:30', items: 'Flytta bilen från uppfarten' });
    const omar = messages.find((m) => m.to.uid === 'omar')!;
    expect(omar).toMatchObject({ template: 'visitReminderStaff', channel: 'email' });
    expect(omar.params['items']).toBe('Ta med kakelfix');
    expect(messages.some((m) => m.to.uid === 'erik')).toBe(false);
  });

  it('sends nothing without a visit tomorrow, or outside the reminder time', async () => {
    await withVisits();
    expect(await sendVisitReminders(db, at('2026-11-03T17:10:00Z'))).toBe(0);
    expect(await sendVisitReminders(db, at('2026-11-02T15:10:00Z'))).toBe(0);
  });
});

describe('generateAllVisits', () => {
  it('creates visits eight weeks ahead, idempotently, skipping skipped dates', async () => {
    await companyWithOwner('c2', 'karin', 'visits');
    const { buildSchedule } = await import('@siteline/shared');
    await db.doc('projects/s1').set({
      companyId: 'c2',
      kind: 'service',
      status: 'active',
      title: 'Matte med Elsa',
      schedule: buildSchedule({
        interval: 1,
        weekdays: ['TU'],
        startDate: '2026-11-03',
        time: '15:00',
        durationMinutes: 60,
        skipDates: ['2026-11-10'],
      }),
    });
    const now = at('2026-11-01T12:00:00Z');
    expect(await generateAllVisits(db, now)).toBe(7);
    expect(await generateAllVisits(db, now)).toBe(0);
    const ids = (await db.collection('projects/s1/visits').get()).docs.map((d) => d.id);
    expect(ids).not.toContain('s-2026-11-10');
    expect(ids).toContain('s-2026-11-03');
  });
});

describe('batching and text budget', () => {
  const base = {
    channel: 'email' as const,
    to: { uid: 'erik', email: 'erik@example.com' },
    recipientKind: 'staff' as const,
    template: 'clientComment' as const,
    params: { client: 'Anna', project: 'Kök', link: 'x' },
    locale: 'sv' as const,
    companyId: 'c1',
    projectId: 'p1',
  };

  it('turns several events within 10 minutes into the first message plus one follow-up (PRD 6)', async () => {
    const t0 = at('2026-10-21T10:00:30Z');
    await queueBatched(db, { ...base, dedupeKey: 'e1' }, t0);
    await queueBatched(db, { ...base, dedupeKey: 'e2' }, new Date(t0.getTime() + 60_000));
    await queueBatched(db, { ...base, dedupeKey: 'e3' }, new Date(t0.getTime() + 120_000));
    const messages = await outbox();
    expect(messages).toHaveLength(2);
    const followUp = messages.find((m) => m.template === 'activity')!;
    expect(followUp.params['count']).toBe('2');
    expect(followUp.sendAfter.toDate().toISOString()).toBe('2026-10-21T10:10:00.000Z');
  });

  it('falls back to email when the monthly text budget is used up, and tells the owners once', async () => {
    await companyWithOwner('c1', 'erik', 'free');
    await db.doc('companies/c1').update({ 'usage.smsThisMonth': 30, 'usage.smsMonth': '2026-10' });
    const now = at('2026-10-21T10:00:00Z');
    const sms = {
      ...base,
      channel: 'sms' as const,
      recipientKind: 'client' as const,
      template: 'staffReply' as const,
      params: { firm: 'Ek', project: 'Kök', link: 'x' },
    };
    await queueMessage(
      db,
      {
        ...sms,
        to: { uid: 'anna', phone: '+46701740605', email: 'anna@example.com' },
        dedupeKey: 's1',
      },
      now,
    );
    await queueMessage(
      db,
      { ...sms, to: { uid: 'bo', phone: '+46701740606', email: null }, dedupeKey: 's2' },
      now,
    );
    const sent: string[] = [];
    const senders = {
      sms: () => ({ send: async () => (sent.push('sms'), { providerMessageId: 'sms' }) }),
      email: () => ({ send: async () => (sent.push('email'), { providerMessageId: 'email' }) }),
    };
    for (const m of await outbox()) await deliver(db, m.id, senders, now);
    expect(sent).toEqual(['email']);
    const messages = await outbox();
    expect(messages.find((m) => m.dedupeKey === 's1')).toMatchObject({
      channel: 'email',
      status: 'sent',
    });
    expect(messages.find((m) => m.dedupeKey === 's2')).toMatchObject({
      status: 'suppressed',
      error: 'sms_budget',
    });
    expect(messages.filter((m) => m.template === 'smsBudgetReached')).toHaveLength(1);
  });

  it('resets the budget at the start of a month', async () => {
    await companyWithOwner('c1', 'erik', 'free');
    await db.doc('companies/c1').update({ 'usage.smsThisMonth': 30, 'usage.smsMonth': '2026-09' });
    const now = at('2026-10-01T10:00:00Z');
    await queueMessage(
      db,
      {
        ...base,
        channel: 'sms',
        recipientKind: 'client',
        template: 'staffReply',
        to: { uid: 'anna', phone: '+46701740605' },
        params: { firm: 'Ek', project: 'Kök', link: 'x' },
        dedupeKey: 'n1',
      },
      now,
    );
    const [m] = await outbox();
    await deliver(
      db,
      m!.id,
      {
        sms: () => ({ send: async () => ({ providerMessageId: 'ok' }) }),
        email: () => ({ send: async () => ({ providerMessageId: 'e' }) }),
      },
      now,
    );
    expect((await db.doc('companies/c1').get()).get('usage')).toMatchObject({
      smsThisMonth: 1,
      smsMonth: '2026-10',
    });
  });
});

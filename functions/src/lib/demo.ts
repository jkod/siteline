import { FieldValue, type Firestore, Timestamp, type WriteBatch } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'node:fs';
import {
  buildSchedule,
  DEFAULT_ACCENT,
  DEFAULT_TEMPLATES,
  type Locale,
  type Media,
  type Plan,
  PLAN_LIMITS,
  type Post,
  stockholmDate,
  TIME_ZONE,
  zonedTimeToUtc,
} from '@siteline/shared';

import { bucket } from './admin';
import { randomToken } from './crypto';
import { decisionSnapshot } from './decisions';
import { generateVisitsForProject, scheduledVisitId } from './visits';

const DAY = 86_400_000;
/** Sandboxes are deleted this long after they're made. */
export const DEMO_DAYS = 3;

export type DemoKind = 'firm' | 'client';

interface Person {
  uid: string;
  name: string;
  role: 'owner' | 'crew' | 'client';
}

interface Firm {
  id: string;
  name: string;
  plan: Plan;
  accentColor: string;
}

/** What a sandbox made, so the nightly purge can delete it all (see purgeDemos). */
export interface DemoRecord {
  uid: string;
  kind: DemoKind;
  companyIds: string[];
  projectIds: string[];
  userIds: string[];
  createdAt: Timestamp;
  expiresAt: Timestamp;
}

/** The example photos ship with the functions, in assets/photos (bundled or from source). */
function photoFile(name: string): Buffer {
  for (const base of ['../assets/photos/', '../../assets/photos/']) {
    const url = new URL(`${base}${name}`, import.meta.url);
    if (existsSync(url)) return readFileSync(url);
  }
  throw new Error(`Missing example photo ${name}`);
}

/**
 * Builds a "try Siteline" sandbox with made-up projects (the user's request to let firms and
 * clients try the app). A firm gets a company it owns with a renovation project and a client;
 * a client gets a renovation from one firm and weekly tutoring from another. The people in it
 * have no phone numbers or emails, and the companies are marked demo, so nothing is ever sent.
 */
export async function createDemo(
  db: Firestore,
  kind: DemoKind,
  user: { uid: string; name: string; locale: Locale },
  now = new Date(),
): Promise<DemoRecord> {
  const id = `demo-${randomToken()
    .slice(0, 10)
    .replace(/[^A-Za-z0-9]/g, 'x')
    .toLowerCase()}`;
  const at = (daysAgo: number) => Timestamp.fromMillis(now.getTime() - daysAgo * DAY);
  const stockholmAt = (daysFromToday: number, hour: number, minute = 0) => {
    const [y, m, d] = stockholmDate(new Date(now.getTime() + daysFromToday * DAY))
      .split('-')
      .map(Number) as [number, number, number];
    return Timestamp.fromDate(zonedTimeToUtc({ year: y, month: m, day: d, hour, minute }));
  };
  const created = FieldValue.serverTimestamp();

  const carpenters: Firm = {
    id: `${id}-snickeri`,
    name: 'Ek & Lind Snickeri',
    plan: 'team',
    accentColor: DEFAULT_ACCENT,
  };
  const tutors: Firm = {
    id: `${id}-matte`,
    name: 'Berg Mattehjälp',
    plan: 'visits',
    accentColor: '#2F5DA8',
  };
  const firms = kind === 'firm' ? [carpenters] : [carpenters, tutors];

  const me: Person = { uid: user.uid, name: user.name, role: kind === 'firm' ? 'owner' : 'client' };
  const erik: Person = kind === 'firm' ? me : { uid: `${id}-erik`, name: 'Erik Ek', role: 'owner' };
  const omar: Person = { uid: `${id}-omar`, name: 'Omar Haddad', role: 'crew' };
  const karin: Person = { uid: `${id}-karin`, name: 'Karin Berg', role: 'owner' };
  const client: Person =
    kind === 'client' ? me : { uid: `${id}-anna`, name: 'Anna Lindqvist', role: 'client' };

  const kitchen = `${id}-kok`;
  const tutoring = `${id}-matte-elsa`;
  const projectIds = kind === 'firm' ? [kitchen] : [kitchen, tutoring];
  const people = [me, erik, omar, client, ...(kind === 'client' ? [karin] : [])].filter(
    (p, i, all) => all.findIndex((q) => q.uid === p.uid) === i,
  );

  const batch = db.batch();

  for (const firm of firms) {
    const staff = firm === carpenters ? [erik, omar] : [karin];
    batch.set(db.doc(`companies/${firm.id}`), {
      name: firm.name,
      orgNumber: null,
      logoPath: null,
      accentColor: firm.accentColor,
      locale: user.locale,
      timeZone: TIME_ZONE,
      plan: firm.plan,
      compedUntil: null,
      limits: PLAN_LIMITS[firm.plan],
      usage: {
        activeProjects: firm === carpenters ? 1 : 0,
        serviceClients: firm === tutors ? 1 : 0,
        staff: staff.length,
        smsThisMonth: 0,
      },
      referredBy: null,
      demo: true,
      settings: {
        digestTime: '18:00',
        reminderTime: '18:00',
        crewCanSendPricedCards: false,
        requirePhoneCheck: false,
      },
      createdAt: created,
      updatedAt: created,
    });
    for (const [trade, template] of Object.entries(DEFAULT_TEMPLATES)) {
      batch.set(db.doc(`companies/${firm.id}/templates/${trade}`), template);
    }
    for (const person of staff) {
      batch.set(db.doc(`companies/${firm.id}/staff/${person.uid}`), {
        role: person.role,
        name: person.name,
        email: null,
        phone: null,
        joinedAt: created,
        notify: { push: false, email: false, quietHours: { start: '21:00', end: '07:00' } },
        createdAt: created,
        updatedAt: created,
      });
    }
  }
  for (const person of people) {
    batch.set(db.doc(`users/${person.uid}`), {
      kind: person.role === 'client' ? 'client' : 'staff',
      name: person.name,
      phoneE164: null,
      email: null,
      locale: user.locale,
      demo: true,
      ...(person.role === 'client'
        ? {}
        : { companyId: person === karin ? tutors.id : carpenters.id }),
      createdAt: created,
      updatedAt: created,
    });
  }

  const branding = (firm: Firm) => ({
    name: firm.name,
    logoUrl: null,
    accentColor: firm.accentColor,
    showSitelineFooter: firm.plan === 'free' || firm.plan === 'visits',
  });
  const member = (person: Person) => ({
    role: person.role === 'client' ? 'client' : 'crew',
    name: person.name,
    phoneMasked: null,
    joinedAt: at(9),
    lastSeenAt: person.role === 'client' ? at(0.5) : null,
    notify:
      person.role === 'client'
        ? { instant: false, digest: true, channel: 'sms' }
        : { instant: true, digest: false, channel: 'email' },
    phoneVerifiedAt: null,
    invite: person.role === 'client' ? { sentAt: at(10), revokedAt: null } : null,
    createdAt: created,
  });
  const post = (author: Person, daysAgo: number, fields: Partial<Post<Timestamp>>) => ({
    type: 'update',
    authorUid: author.uid,
    authorName: author.name,
    authorRole: author.role,
    text: '',
    media: [] as Media[],
    visibility: 'all',
    milestone: null,
    commentCount: 0,
    unanswered: false,
    createdAt: at(daysAgo),
    editedAt: null,
    deletedAt: null,
    ...fields,
  });
  const photo = async (projectId: string, name: string): Promise<Media> => {
    const base = `projects/${projectId}/media/demo-${name}`;
    for (const size of ['display', 'thumb'] as const) {
      await bucket()
        .file(`${base}/${size}.jpg`)
        .save(photoFile(`${name}-${size}.jpg`), { contentType: 'image/jpeg' });
    }
    return {
      path: `${base}/display.jpg`,
      thumbPath: `${base}/thumb.jpg`,
      width: 1600,
      height: 1200,
      tags: [],
    };
  };

  // The kitchen renovation, as in the seed data.
  batch.set(db.doc(`projects/${kitchen}`), {
    companyId: carpenters.id,
    kind: 'project',
    title: 'Köksrenovering Lindqvist',
    address: { street: 'Tallvägen 4', postalCode: '133 34', city: 'Saltsjöbaden' },
    schedule: null,
    status: 'active',
    startDate: stockholmDate(new Date(now.getTime() - 10 * DAY)),
    endDate: stockholmDate(new Date(now.getTime() + 30 * DAY)),
    branding: branding(carpenters),
    roles: { [omar.uid]: 'crew', [client.uid]: 'client' },
    clientUids: [client.uid],
    crewUids: [omar.uid],
    demo: true,
    totals: {
      approvedExtraWorkOre: 650_000,
      openDecisions: 1,
      unansweredQuestions: 1,
      oldestOpenDecisionAt: at(1.2),
    },
    nextVisitId: 'v-next',
    lastPostAt: at(0.08),
    completedAt: null,
    createdAt: created,
    updatedAt: created,
  });
  batch.set(db.doc(`projects/${kitchen}/members/${client.uid}`), member(client));
  batch.set(db.doc(`projects/${kitchen}/members/${omar.uid}`), member(omar));

  const beam = await photo(kitchen, 'bjalke');
  const kitchenPosts: [string, ReturnType<typeof post>][] = [
    [
      'p01',
      post(erik, 9, {
        text: 'Vi har börjat riva köket. De gamla skåpen är ute och golvet ligger öppet.',
        media: [await photo(kitchen, 'rivning')],
      }),
    ],
    [
      'p02',
      post(omar, 8.6, {
        text: 'Golvbjälken under diskbänken är rutten och behöver bytas. Vi återkommer med pris i morgon.',
        media: [beam],
      }),
    ],
    [
      'p03',
      post(erik, 8, {
        type: 'milestone',
        text: 'Rivning klar',
        milestone: { stage: 1, stageCount: 4 },
      }),
    ],
    [
      'p05',
      post(omar, 5, {
        text: 'Elektrikern har dragit nya uttag vid bänken och under överskåpen.',
        media: [await photo(kitchen, 'el')],
      }),
    ],
    [
      'p06',
      post(erik, 4.2, {
        type: 'milestone',
        text: 'El och VVS klart',
        milestone: { stage: 2, stageCount: 4 },
      }),
    ],
    [
      'p07',
      post(erik, 3, {
        text: 'Kaklet bakom spisen är uppsatt. Fogningen görs i morgon.',
        media: [await photo(kitchen, 'kakel')],
      }),
    ],
    [
      'p08',
      post(omar, 1.5, {
        text: 'Skåpstommarna är på plats. Luckorna kommer på fredag.',
        media: [await photo(kitchen, 'skap1'), await photo(kitchen, 'skap2')],
      }),
    ],
    [
      'p09',
      post(client, 0.4, {
        type: 'question',
        text: 'Kan vi få ett extra uttag vid fönstret?',
        unanswered: true,
      }),
    ],
    [
      'p10',
      post(erik, 0.08, { text: 'Bänkskivan levereras på måndag förmiddag. Vi bär in den direkt.' }),
    ],
  ];
  for (const [postId, data] of kitchenPosts) {
    batch.set(db.doc(`projects/${kitchen}/posts/${postId}`), data);
  }

  const approved = post(erik, 8.4, {
    type: 'decision',
    text: 'Bjälken under diskbänken är rutten och behöver bytas innan golvet läggs.',
    media: [beam],
    decision: {
      kind: 'extra_work',
      title: 'Byt rutten golvbjälke',
      description: 'Bjälken under diskbänken är rutten och behöver bytas innan golvet läggs.',
      priceOre: 650_000,
      labourOre: 420_000,
      materialOre: 230_000,
      vatRate: 0.25,
      status: 'approved',
      version: 1,
      createdByUid: erik.uid,
      sentAt: at(8.4),
      sentByUid: erik.uid,
      decidedAt: at(8.3),
      approvalId: 'd-bjalke_v1',
      decidedByName: client.name,
      selectedOptionId: null,
      declineReason: null,
    } as never,
  });
  batch.set(db.doc(`projects/${kitchen}/posts/d-bjalke`), approved);
  const { snapshot, sha256 } = decisionSnapshot(
    approved as unknown as Post,
    'Köksrenovering Lindqvist',
  );
  batch.set(db.doc(`projects/${kitchen}/approvals/d-bjalke_v1`), {
    postId: 'd-bjalke',
    version: 1,
    kind: 'decision',
    outcome: 'approved',
    optionId: null,
    priceOre: 650_000,
    reason: null,
    snapshot,
    snapshotSha256: sha256,
    actorUid: client.uid,
    actorName: client.name,
    actorPhoneMasked: null,
    phoneVerified: false,
    createdAt: at(8.3),
  });
  batch.set(
    db.doc(`projects/${kitchen}/posts/d-uttag`),
    post(erik, 1.2, {
      type: 'decision',
      text: 'Ett dubbeluttag vid fönstret, infällt och jordat.',
      decision: {
        kind: 'extra_work',
        title: 'Extra uttag vid fönstret',
        description: 'Ett dubbeluttag vid fönstret, infällt och jordat.',
        priceOre: 180_000,
        labourOre: 120_000,
        materialOre: 60_000,
        vatRate: 0.25,
        status: 'sent',
        version: 1,
        createdByUid: erik.uid,
        sentAt: at(1.2),
        sentByUid: erik.uid,
      } as never,
    }),
  );

  batch.set(db.doc(`projects/${kitchen}/visits/v-next`), {
    companyId: carpenters.id,
    startAt: stockholmAt(1, 7, 30),
    endAt: stockholmAt(1, 16, 0),
    people: 2,
    notes: 'Vattnet är avstängt 09:00-11:00.',
    status: 'planned',
    fromSchedule: false,
    reportPostId: null,
    createdAt: created,
    updatedAt: created,
  });
  const item = (itemId: string, text: string, side: 'client' | 'firm', by: Person) =>
    batch.set(db.doc(`projects/${kitchen}/checklist/${itemId}`), {
      text,
      side,
      visitId: 'v-next',
      createdBy: by.uid,
      createdByName: by.name,
      createdAt: created,
      doneBy: null,
      doneByName: null,
      doneAt: null,
    });
  item('c-bil', 'Flytta bilen från uppfarten', 'client', erik);
  item('c-skap', 'Töm skåpen under diskbänken', 'client', client);
  item('c-fix', 'Ta med kakelfix och fogsvamp', 'firm', omar);

  // Weekly tutoring with three reports, for clients.
  let tutoringSchedule: ReturnType<typeof buildSchedule> | null = null;
  if (kind === 'client') {
    const start = stockholmDate(new Date(now.getTime() - 21 * DAY));
    const weekday = (['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const)[
      new Date(`${start}T12:00:00Z`).getUTCDay()
    ];
    tutoringSchedule = buildSchedule({
      interval: 1,
      weekdays: [weekday],
      startDate: start,
      time: '15:00',
      durationMinutes: 60,
    });
    batch.set(db.doc(`projects/${tutoring}`), {
      companyId: tutors.id,
      kind: 'service',
      title: 'Matte med Elsa',
      address: null,
      schedule: tutoringSchedule,
      templateId: 'tutoring',
      photoConsentAt: at(30),
      status: 'active',
      startDate: start,
      endDate: null,
      branding: branding(tutors),
      roles: { [client.uid]: 'client' },
      clientUids: [client.uid],
      crewUids: [],
      demo: true,
      totals: { approvedExtraWorkOre: 0, openDecisions: 0, unansweredQuestions: 0 },
      nextVisitId: null,
      lastPostAt: at(2),
      completedAt: null,
      createdAt: created,
      updatedAt: created,
    });
    batch.set(db.doc(`projects/${tutoring}/members/${client.uid}`), member(client));
    const reports = [
      {
        week: 3,
        note: 'Vi repeterade bråk och började med procent.',
        rating: 'ok',
        practice: 'Procentuppgifterna på sidan 30',
      },
      {
        week: 2,
        note: 'Procent sitter bättre nu. Vi tog några textuppgifter.',
        rating: 'good',
        practice: 'Två textuppgifter på sidan 34',
      },
      {
        week: 1,
        note: 'Vi gick igenom ekvationer med en okänd. Elsa jobbade bra!',
        rating: 'good',
        practice: 'Öva på sidan 42',
      },
    ] as const;
    for (const r of reports) {
      const visitId = scheduledVisitId(stockholmDate(new Date(now.getTime() - r.week * 7 * DAY)));
      const startAt = stockholmAt(-r.week * 7, 15);
      batch.set(db.doc(`projects/${tutoring}/visits/${visitId}`), {
        companyId: tutors.id,
        startAt,
        endAt: Timestamp.fromMillis(startAt.toMillis() + 3600_000),
        people: null,
        notes: '',
        status: 'done',
        fromSchedule: true,
        reportPostId: `r-${r.week}`,
        createdAt: created,
        updatedAt: created,
      });
      batch.set(
        db.doc(`projects/${tutoring}/posts/r-${r.week}`),
        post(karin, r.week * 7 - 0.05, {
          type: 'visit_report',
          text: r.note,
          media: r.week === 1 ? [await photo(tutoring, 'matte')] : [],
          report: {
            visitId,
            templateId: 'tutoring',
            done: DEFAULT_TEMPLATES.tutoring.items.map((i) => ({
              itemId: i.id,
              label: i.label,
              checked: true,
            })),
            rating: r.rating,
            note: r.note,
            flags: [],
            nextTimeItemIds: [],
            nextTime: [r.practice],
          } as never,
        }),
      );
    }
  }

  const record: DemoRecord = {
    uid: user.uid,
    kind,
    companyIds: firms.map((f) => f.id),
    projectIds,
    userIds: people.map((p) => p.uid),
    createdAt: Timestamp.fromDate(now),
    expiresAt: Timestamp.fromMillis(now.getTime() + DEMO_DAYS * DAY),
  };
  batch.set(db.doc(`demos/${user.uid}`), record);
  await batch.commit();

  if (tutoringSchedule) {
    await generateVisitsForProject(
      db,
      tutoring,
      { companyId: tutors.id, schedule: tutoringSchedule },
      now,
    );
    const next = await db
      .collection(`projects/${tutoring}/visits`)
      .where('status', '==', 'planned')
      .orderBy('startAt')
      .limit(1)
      .get();
    await db.doc(`projects/${tutoring}`).update({ nextVisitId: next.docs[0]?.id ?? null });
  }
  return record;
}

/** Deletes everything a sandbox made: documents, photos and the made-up people's accounts. */
export async function deleteDemo(
  db: Firestore,
  record: DemoRecord,
  deleteUsers: (uids: string[]) => Promise<unknown>,
): Promise<void> {
  for (const projectId of record.projectIds) {
    await db.recursiveDelete(db.doc(`projects/${projectId}`));
    await bucket().deleteFiles({ prefix: `projects/${projectId}/` });
  }
  for (const companyId of record.companyIds) {
    await db.recursiveDelete(db.doc(`companies/${companyId}`));
  }
  const batch: WriteBatch = db.batch();
  for (const uid of record.userIds) batch.delete(db.doc(`users/${uid}`));
  batch.delete(db.doc(`demos/${record.uid}`));
  await batch.commit();
  await deleteUsers([record.uid]);
}

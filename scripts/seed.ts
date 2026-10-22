/**
 * Seeds the Emulator Suite with the fictional data from PRD section 13. Run through
 * `npm run dev`, `npm run seed` (add --wait to wait for emulators started separately) or `npm run e2e`.
 *
 * Ek & Lind Snickeri (owner Erik, crew Omar) runs "Köksrenovering Lindqvist" for Anna Lindqvist,
 * with ten posts and placeholder photos. Berg Mattehjälp (tutor Karin) has "Matte med Elsa" for
 * the same client, so her home screen shows both firms. Decisions and visits are added by M2.
 */
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

import {
  buildSchedule,
  DEFAULT_ACCENT,
  DEFAULT_TEMPLATES,
  maskPhone,
  type Plan,
  PLAN_LIMITS,
  type Post,
  type StaffRole,
  stockholmDate,
  TIME_ZONE,
  zonedTimeToUtc,
} from '../shared/src/index';

process.env['GCLOUD_PROJECT'] ??= 'demo-siteline';
process.env['FIRESTORE_EMULATOR_HOST'] ??= '127.0.0.1:8080';
process.env['FIREBASE_AUTH_EMULATOR_HOST'] ??= '127.0.0.1:9099';
process.env['FIREBASE_STORAGE_EMULATOR_HOST'] ??= '127.0.0.1:9199';
process.env['APP_URL'] ??=
  process.env['GCLOUD_PROJECT'] === 'demo-siteline-test'
    ? 'http://localhost:4300'
    : 'http://localhost:4200';

if (!process.env['GCLOUD_PROJECT']?.startsWith('demo-')) {
  throw new Error('The seed only runs against a demo- project in the Emulator Suite.');
}

const HUB = 'http://127.0.0.1:4400/emulators';
const DAY = 86_400_000;

interface Person {
  uid: string;
  name: string;
  email?: string;
  phoneE164?: string;
}

interface StaffSeed extends Person {
  companyId: string;
  role: StaffRole;
}

const companies: { id: string; name: string; plan: Plan; accentColor: string }[] = [
  { id: 'ek-lind', name: 'Ek & Lind Snickeri', plan: 'team', accentColor: DEFAULT_ACCENT },
  { id: 'berg-mattehjalp', name: 'Berg Mattehjälp', plan: 'visits', accentColor: '#2F5DA8' },
];

// Phone numbers are in the range PTS reserves for fiction (070-174 06 05 to 070-174 06 99).
const staff: StaffSeed[] = [
  {
    uid: 'erik-ek',
    name: 'Erik Ek',
    email: 'erik@eklind.example',
    phoneE164: '+46701740610',
    companyId: 'ek-lind',
    role: 'owner',
  },
  {
    uid: 'omar-haddad',
    name: 'Omar Haddad',
    email: 'omar@eklind.example',
    phoneE164: '+46701740611',
    companyId: 'ek-lind',
    role: 'crew',
  },
  {
    uid: 'karin-berg',
    name: 'Karin Berg',
    email: 'karin@bergmatte.example',
    phoneE164: '+46701740620',
    companyId: 'berg-mattehjalp',
    role: 'owner',
  },
];

const anna: Person = { uid: 'anna-lindqvist', name: 'Anna Lindqvist', phoneE164: '+46701740605' };

async function waitForEmulators(timeoutMs = 120_000): Promise<void> {
  const started = Date.now();
  for (;;) {
    try {
      const running = (await (await fetch(HUB)).json()) as Record<string, unknown>;
      if (running['auth'] && running['firestore'] && running['storage']) return;
    } catch {
      // Not up yet.
    }
    if (Date.now() - started > timeoutMs) throw new Error('The emulators did not start in time.');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

async function main(): Promise<void> {
  if (process.argv.includes('--wait')) await waitForEmulators();

  // Import after the emulator variables are set, so the Admin SDK connects to the emulators.
  const { auth, bucket, db } = await import('../functions/src/lib/admin');
  const { setStaffClaims } = await import('../functions/src/lib/claims');
  const { sha256Hex } = await import('../functions/src/lib/crypto');
  const { createInvite, inviteLink } = await import('../functions/src/lib/invites');
  const { queueMessage } = await import('../functions/src/lib/outbox');
  const { decisionSnapshot } = await import('../functions/src/lib/decisions');
  const { generateVisitsForProject, scheduledVisitId } =
    await import('../functions/src/lib/visits');

  /** A Stockholm wall-clock time some days from today. */
  const stockholmAt = (daysFromToday: number, hour: number, minute = 0) => {
    const [y, m, d] = stockholmDate(new Date(Date.now() + daysFromToday * DAY))
      .split('-')
      .map(Number) as [number, number, number];
    return zonedTimeToUtc({ year: y, month: m, day: d, hour, minute });
  };

  async function upsertAuthUser(person: Person): Promise<void> {
    // Client accounts hold no contact details in Firebase Authentication (PRD 4.1).
    const props = { displayName: person.name, email: person.email };
    try {
      await auth.updateUser(person.uid, props);
    } catch {
      await auth.createUser({ uid: person.uid, ...props, emailVerified: Boolean(person.email) });
    }
  }

  const photo = async (projectId: string, name: string) => {
    const base = `projects/${projectId}/media/seed-${name}`;
    for (const size of ['display', 'thumb'] as const) {
      const file = readFileSync(new URL(`./seed-photos/${name}-${size}.jpg`, import.meta.url));
      await bucket().file(`${base}/${size}.jpg`).save(file, { contentType: 'image/jpeg' });
    }
    return {
      path: `${base}/display.jpg`,
      thumbPath: `${base}/thumb.jpg`,
      width: 1600,
      height: 1200,
      tags: [],
    };
  };

  const now = FieldValue.serverTimestamp();
  const batch = db.batch();

  for (const company of companies) {
    const members = staff.filter((s) => s.companyId === company.id);
    batch.set(db.doc(`companies/${company.id}`), {
      name: company.name,
      orgNumber: null,
      logoPath: null,
      accentColor: company.accentColor,
      locale: 'sv',
      timeZone: TIME_ZONE,
      plan: company.plan,
      compedUntil: null,
      limits: PLAN_LIMITS[company.plan],
      usage: {
        activeProjects: company.id === 'ek-lind' ? 1 : 0,
        serviceClients: company.id === 'berg-mattehjalp' ? 1 : 0,
        staff: members.length,
        smsThisMonth: 0,
      },
      referredBy: null,
      settings: {
        digestTime: '18:00',
        reminderTime: '18:00',
        crewCanSendPricedCards: false,
        requirePhoneCheck: false,
      },
      createdAt: now,
      updatedAt: now,
    });
  }

  for (const company of companies) {
    for (const [trade, template] of Object.entries(DEFAULT_TEMPLATES)) {
      batch.set(db.doc(`companies/${company.id}/templates/${trade}`), template);
    }
  }

  for (const person of staff) {
    await upsertAuthUser(person);
    await setStaffClaims(auth, person.uid, { cid: person.companyId, crole: person.role });
    batch.set(db.doc(`companies/${person.companyId}/staff/${person.uid}`), {
      role: person.role,
      name: person.name,
      email: person.email,
      phone: person.phoneE164,
      joinedAt: now,
      notify: { push: true, email: true, quietHours: { start: '21:00', end: '07:00' } },
      createdAt: now,
      updatedAt: now,
    });
    batch.set(db.doc(`users/${person.uid}`), {
      kind: 'staff',
      name: person.name,
      phoneE164: person.phoneE164,
      email: person.email,
      locale: 'sv',
      companyId: person.companyId,
      createdAt: now,
      updatedAt: now,
    });
  }

  await upsertAuthUser(anna);
  await auth.setCustomUserClaims(anna.uid, { kind: 'client' });
  batch.set(db.doc(`users/${anna.uid}`), {
    kind: 'client',
    name: anna.name,
    phoneE164: anna.phoneE164,
    email: null,
    locale: 'sv',
    createdAt: now,
    updatedAt: now,
  });
  batch.set(db.doc(`clientPhones/${sha256Hex(anna.phoneE164!)}`), {
    uid: anna.uid,
    createdAt: now,
  });

  const branding = (company: (typeof companies)[number]) => ({
    name: company.name,
    logoUrl: null,
    accentColor: company.accentColor,
    showSitelineFooter: company.plan === 'free' || company.plan === 'visits',
  });
  const member = (role: 'client' | 'crew', name: string, phone?: string) => ({
    role,
    name,
    phoneMasked: phone ? maskPhone(phone) : null,
    joinedAt: Timestamp.fromMillis(Date.now() - 9 * DAY),
    lastSeenAt: role === 'client' ? Timestamp.fromMillis(Date.now() - DAY / 2) : null,
    notify:
      role === 'client'
        ? { instant: false, digest: true, channel: 'sms' }
        : { instant: true, digest: false, channel: 'email' },
    phoneVerifiedAt: null,
    invite:
      role === 'client'
        ? { sentAt: Timestamp.fromMillis(Date.now() - 10 * DAY), revokedAt: null }
        : null,
    createdAt: now,
  });

  // Köksrenovering Lindqvist
  const kitchen = 'lindqvist-kok';
  batch.set(db.doc(`projects/${kitchen}`), {
    companyId: 'ek-lind',
    kind: 'project',
    title: 'Köksrenovering Lindqvist',
    address: { street: 'Tallvägen 4', postalCode: '133 34', city: 'Saltsjöbaden' },
    schedule: null,
    status: 'active',
    startDate: '2026-10-12',
    endDate: '2026-11-20',
    branding: branding(companies[0]!),
    roles: { 'omar-haddad': 'crew', [anna.uid]: 'client' },
    clientUids: [anna.uid],
    crewUids: ['omar-haddad'],
    totals: {
      approvedExtraWorkOre: 650_000,
      openDecisions: 1,
      unansweredQuestions: 1,
      // d-uttag, sent 0.3 days ago.
      oldestOpenDecisionAt: Timestamp.fromMillis(Date.now() - 0.3 * DAY),
    },
    nextVisitId: 'v-next',
    lastPostAt: Timestamp.fromMillis(Date.now() - 2 * 3600_000),
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  batch.set(
    db.doc(`projects/${kitchen}/members/${anna.uid}`),
    member('client', anna.name, anna.phoneE164),
  );
  batch.set(db.doc(`projects/${kitchen}/members/omar-haddad`), member('crew', 'Omar Haddad'));

  const author = (uid: string) => {
    if (uid === anna.uid)
      return { authorUid: uid, authorName: anna.name, authorRole: 'client' as const };
    const s = staff.find((p) => p.uid === uid)!;
    return { authorUid: uid, authorName: s.name, authorRole: s.role };
  };
  const post = (uid: string, daysAgo: number, fields: Partial<Post>): Post<Timestamp> => ({
    type: 'update',
    ...author(uid),
    text: '',
    media: [],
    visibility: 'all',
    milestone: null,
    commentCount: 0,
    unanswered: false,
    createdAt: Timestamp.fromMillis(Date.now() - daysAgo * DAY),
    editedAt: null,
    deletedAt: null,
    ...(fields as Partial<Post<Timestamp>>),
  });

  const kitchenPosts: [string, Post<Timestamp>][] = [
    [
      'p01',
      post('erik-ek', 9, {
        text: 'Vi har börjat riva köket. De gamla skåpen är ute och golvet ligger öppet.',
        media: [await photo(kitchen, 'rivning')],
      }),
    ],
    [
      'p02',
      post('omar-haddad', 8.6, {
        text: 'Golvbjälken under diskbänken är rutten och behöver bytas. Vi återkommer med pris i morgon.',
        media: [await photo(kitchen, 'bjalke')],
      }),
    ],
    [
      'p03',
      post('erik-ek', 8, {
        type: 'milestone',
        text: 'Rivning klar',
        milestone: { stage: 1, stageCount: 4 },
      }),
    ],
    [
      'p04',
      post(anna.uid, 6.5, {
        type: 'question',
        text: 'Hur länge blir vi utan vatten på torsdag?',
        commentCount: 1,
      }),
    ],
    [
      'p05',
      post('omar-haddad', 5, {
        text: 'Elektrikern har dragit nya uttag vid bänken och under överskåpen.',
        media: [await photo(kitchen, 'el')],
      }),
    ],
    [
      'p06',
      post('erik-ek', 4.2, {
        type: 'milestone',
        text: 'El och VVS klart',
        milestone: { stage: 2, stageCount: 4 },
      }),
    ],
    [
      'p07',
      post('erik-ek', 3, {
        text: 'Kaklet bakom spisen är uppsatt. Fogningen görs i morgon.',
        media: [await photo(kitchen, 'kakel')],
      }),
    ],
    [
      'p08',
      post('omar-haddad', 1.5, {
        text: 'Skåpstommarna är på plats. Luckorna kommer på fredag.',
        media: [await photo(kitchen, 'skap1'), await photo(kitchen, 'skap2')],
      }),
    ],
    [
      'p09',
      post(anna.uid, 0.4, {
        type: 'question',
        text: 'Kan vi få ett extra uttag vid fönstret?',
        unanswered: true,
      }),
    ],
    [
      'p10',
      post('erik-ek', 0.08, {
        text: 'Bänkskivan levereras på måndag förmiddag. Vi bär in den direkt.',
      }),
    ],
  ];
  for (const [id, data] of kitchenPosts) batch.set(db.doc(`projects/${kitchen}/posts/${id}`), data);
  batch.set(db.doc(`projects/${kitchen}/posts/p04/comments/c1`), {
    ...author('erik-ek'),
    text: 'Vattnet är avstängt 09:00-11:00. Vi ställer fram en dunk i hallen.',
    media: [],
    createdAt: Timestamp.fromMillis(Date.now() - 6.4 * DAY),
    editedAt: null,
    deletedAt: null,
  });

  // One approved and one open extra-work card (PRD section 13).
  const approved = post('erik-ek', 8.4, {
    type: 'decision',
    text: 'Bjälken under diskbänken är rutten och behöver bytas innan golvet läggs.',
    media: kitchenPosts[1]![1].media,
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
      createdByUid: 'erik-ek',
      sentAt: Timestamp.fromMillis(Date.now() - 8.4 * DAY),
      sentByUid: 'erik-ek',
      decidedAt: Timestamp.fromMillis(Date.now() - 8.3 * DAY),
      approvalId: 'd-bjalke_v1',
      decidedByName: anna.name,
      selectedOptionId: null,
      declineReason: null,
    },
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
    actorUid: anna.uid,
    actorName: anna.name,
    actorPhoneMasked: maskPhone(anna.phoneE164!),
    phoneVerified: false,
    createdAt: Timestamp.fromMillis(Date.now() - 8.3 * DAY),
  });
  batch.set(
    db.doc(`projects/${kitchen}/posts/d-uttag`),
    post('erik-ek', 0.3, {
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
        createdByUid: 'erik-ek',
        sentAt: Timestamp.fromMillis(Date.now() - 0.3 * DAY),
        sentByUid: 'erik-ek',
      },
    }),
  );

  // Tomorrow's visit with three checklist items (PRD section 13).
  batch.set(db.doc(`projects/${kitchen}/visits/v-next`), {
    companyId: 'ek-lind',
    startAt: Timestamp.fromDate(stockholmAt(1, 7, 30)),
    endAt: Timestamp.fromDate(stockholmAt(1, 16, 0)),
    people: 2,
    notes: 'Vattnet är avstängt 09:00-11:00.',
    status: 'planned',
    fromSchedule: false,
    reportPostId: null,
    createdAt: now,
    updatedAt: now,
  });
  const item = (id: string, text: string, side: 'client' | 'firm', by: Person) =>
    batch.set(db.doc(`projects/${kitchen}/checklist/${id}`), {
      text,
      side,
      visitId: 'v-next',
      createdBy: by.uid,
      createdByName: by.name,
      createdAt: now,
      doneBy: null,
      doneByName: null,
      doneAt: null,
    });
  item('c-bil', 'Flytta bilen från uppfarten', 'client', staff[0]!);
  item('c-skap', 'Töm skåpen under diskbänken', 'client', anna);
  item('c-fix', 'Ta med kakelfix och fogsvamp', 'firm', staff[1]!);

  // Matte med Elsa: weekly on Tuesdays at 15:00, three visits reported so far.
  const tutoring = 'matte-elsa';
  // Start on the weekday three weeks ago, so there are three past visits.
  const tutoringStart = stockholmDate(new Date(Date.now() - 21 * DAY));
  const tutoringWeekday = (['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const)[
    new Date(`${tutoringStart}T12:00:00Z`).getUTCDay()
  ];
  const tutoringSchedule = buildSchedule({
    interval: 1,
    weekdays: [tutoringWeekday],
    startDate: tutoringStart,
    time: '15:00',
    durationMinutes: 60,
  });
  batch.set(db.doc(`projects/${tutoring}`), {
    companyId: 'berg-mattehjalp',
    kind: 'service',
    title: 'Matte med Elsa',
    address: null,
    schedule: tutoringSchedule,
    templateId: 'tutoring',
    photoConsentAt: Timestamp.fromMillis(Date.now() - 30 * DAY),
    status: 'active',
    startDate: tutoringStart,
    endDate: null,
    branding: branding(companies[1]!),
    roles: { [anna.uid]: 'client' },
    clientUids: [anna.uid],
    crewUids: [],
    totals: { approvedExtraWorkOre: 0, openDecisions: 0, unansweredQuestions: 0 },
    nextVisitId: null,
    lastPostAt: Timestamp.fromMillis(Date.now() - 2 * DAY),
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  batch.set(
    db.doc(`projects/${tutoring}/members/${anna.uid}`),
    member('client', anna.name, anna.phoneE164),
  );
  const reports = [
    {
      week: 3,
      note: 'Vi repeterade bråk och började med procent.',
      rating: 'ok' as const,
      practice: 'Procentuppgifterna på sidan 30',
    },
    {
      week: 2,
      note: 'Procent sitter bättre nu. Vi tog några textuppgifter.',
      rating: 'good' as const,
      practice: 'Två textuppgifter på sidan 34',
    },
    {
      week: 1,
      note: 'Vi gick igenom ekvationer med en okänd. Elsa jobbade bra!',
      rating: 'good' as const,
      practice: 'Öva på sidan 42',
    },
  ];
  for (const r of reports) {
    const date = stockholmDate(new Date(Date.now() - r.week * 7 * DAY));
    const visitId = scheduledVisitId(date);
    const start = Timestamp.fromDate(stockholmAt(-r.week * 7, 15));
    batch.set(db.doc(`projects/${tutoring}/visits/${visitId}`), {
      companyId: 'berg-mattehjalp',
      startAt: start,
      endAt: Timestamp.fromMillis(start.toMillis() + 3600_000),
      people: null,
      notes: '',
      status: 'done',
      fromSchedule: true,
      reportPostId: `r-${r.week}`,
      createdAt: now,
      updatedAt: now,
    });
    batch.set(
      db.doc(`projects/${tutoring}/posts/r-${r.week}`),
      post('karin-berg', r.week * 7 - 0.05, {
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
        },
      }),
    );
  }

  await batch.commit();
  await generateVisitsForProject(db, tutoring, {
    companyId: 'berg-mattehjalp',
    schedule: tutoringSchedule,
  });
  const nextLesson = (
    await db
      .collection(`projects/${tutoring}/visits`)
      .where('status', '==', 'planned')
      .orderBy('startAt')
      .limit(1)
      .get()
  ).docs[0];
  await db.doc(`projects/${tutoring}`).update({ nextVisitId: nextLesson?.id ?? null });

  // Anna's link to the kitchen project, sent the real way: the outbox, then the dev SMS sender.
  const { token, hash } = await createInvite(db, {
    kind: 'client',
    projectId: kitchen,
    companyId: 'ek-lind',
    role: 'client',
    uid: anna.uid,
    name: anna.name,
    phoneE164: anna.phoneE164!,
    email: null,
    createdBy: 'erik-ek',
    expiresAt: null,
  });
  await queueMessage(db, {
    channel: 'sms',
    to: { uid: anna.uid, phone: anna.phoneE164 },
    // Staff kind, so the seed's text goes out at once even during quiet hours.
    recipientKind: 'staff',
    template: 'clientInvite',
    params: {
      firstName: 'Anna',
      firm: 'Ek & Lind Snickeri',
      project: 'Köksrenovering Lindqvist',
      link: inviteLink(token),
      settingsPath: '/c/settings',
    },
    locale: 'sv',
    companyId: 'ek-lind',
    projectId: kitchen,
    dedupeKey: `clientInvite:${hash}`,
  });

  console.log('Seeded the emulators:');
  for (const person of staff)
    console.log(`  ${person.role.padEnd(5)}  ${person.email}  (${person.companyId})`);
  console.log(`  client ${anna.name}: open her link from ${process.env['APP_URL']}/dev/outbox`);
  console.log(
    `Staff sign in at ${process.env['APP_URL']}/login and open the link from /dev/outbox.`,
  );
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);

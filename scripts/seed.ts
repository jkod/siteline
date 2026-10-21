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
  DEFAULT_ACCENT,
  maskPhone,
  type Plan,
  PLAN_LIMITS,
  type Post,
  type StaffRole,
  TIME_ZONE,
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
    totals: { approvedExtraWorkOre: 0, openDecisions: 0, unansweredQuestions: 1 },
    nextVisitId: null,
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

  // Matte med Elsa (service client; schedule and visits arrive with M2)
  const tutoring = 'matte-elsa';
  batch.set(db.doc(`projects/${tutoring}`), {
    companyId: 'berg-mattehjalp',
    kind: 'service',
    title: 'Matte med Elsa',
    address: null,
    schedule: null,
    status: 'active',
    startDate: '2026-09-01',
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
  batch.set(
    db.doc(`projects/${tutoring}/posts/p01`),
    post('karin-berg', 2, {
      text: 'Vi gick igenom ekvationer med en okänd. Elsa jobbade bra! Öva på sidan 42 till nästa gång.',
      media: [await photo(tutoring, 'matte')],
    }),
  );

  await batch.commit();

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

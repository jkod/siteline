/**
 * Seeds the Emulator Suite with the fictional data from PRD section 13. Run through
 * `npm run dev` (with --wait, so it waits for the emulators) or `npm run seed`.
 *
 * M0 creates the companies, staff, the client and their sign-in accounts. Projects, posts,
 * decisions and visits are added by the milestones that build them.
 */
import { FieldValue } from 'firebase-admin/firestore';

import { DevSmsSender } from '../functions/src/adapters/dev-outbox';
import {
  DEFAULT_ACCENT,
  type Plan,
  PLAN_LIMITS,
  type StaffRole,
  TIME_ZONE,
} from '../shared/src/index';

const PROJECT_ID = 'demo-siteline';

process.env['GCLOUD_PROJECT'] ??= PROJECT_ID;
process.env['FIRESTORE_EMULATOR_HOST'] ??= '127.0.0.1:8080';
process.env['FIREBASE_AUTH_EMULATOR_HOST'] ??= '127.0.0.1:9099';
process.env['FIREBASE_STORAGE_EMULATOR_HOST'] ??= '127.0.0.1:9199';

if (!process.env['GCLOUD_PROJECT']?.startsWith('demo-')) {
  throw new Error('The seed only runs against a demo- project in the Emulator Suite.');
}

const HUB = 'http://127.0.0.1:4400/emulators';
const APP_URL = 'http://localhost:4200';

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

interface CompanySeed {
  id: string;
  name: string;
  plan: Plan;
  accentColor: string;
}

const companies: CompanySeed[] = [
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
      const response = await fetch(HUB);
      const running = (await response.json()) as Record<string, unknown>;
      if (running['auth'] && running['firestore']) return;
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
  const { auth, db } = await import('../functions/src/lib/admin');
  const { setStaffClaims } = await import('../functions/src/lib/claims');

  async function upsertAuthUser(person: Person): Promise<void> {
    // Client accounts hold no contact details in Firebase Authentication (PRD 4.1).
    const props = { displayName: person.name, email: person.email };
    try {
      await auth.updateUser(person.uid, props);
    } catch {
      await auth.createUser({ uid: person.uid, ...props, emailVerified: Boolean(person.email) });
    }
  }

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
      usage: { activeProjects: 0, serviceClients: 0, staff: members.length, smsThisMonth: 0 },
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

  await batch.commit();

  // One sample text through the dev SMS adapter, so /dev/outbox has something to show.
  const outbox = await db.collection('devOutbox').limit(1).get();
  if (outbox.empty) {
    await new DevSmsSender(db).send({
      to: anna.phoneE164 ?? '',
      sender: 'Ek & Lind',
      text: `Hej Anna! Ek & Lind Snickeri delar uppdateringar om Köksrenovering Lindqvist här: ${APP_URL}/p/seed-example`,
    });
  }

  console.log('Seeded the emulators:');
  for (const person of staff) {
    console.log(`  ${person.role.padEnd(5)}  ${person.email}  (${person.companyId})`);
  }
  console.log(`  client ${anna.name} (signs in through an invite link from M1)`);
  console.log(`Sign in at ${APP_URL}/login and open the link from ${APP_URL}/dev/outbox.`);
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);

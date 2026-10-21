import { doc, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

// A separate project ID, so rules tests never clear the dev seed data.
export const RULES_PROJECT_ID = 'demo-siteline-rules';

export function createRulesEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: RULES_PROJECT_ID,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  });
}

export interface TestUser {
  uid: string;
  name: string;
  token: Record<string, string>;
}

export const owner: TestUser = {
  uid: 'owner1',
  name: 'Erik Ek',
  token: { cid: 'company1', crole: 'owner' },
};
export const admin: TestUser = {
  uid: 'admin1',
  name: 'Alva Admin',
  token: { cid: 'company1', crole: 'admin' },
};
/** Assigned to project p1. */
export const crew: TestUser = {
  uid: 'crew1',
  name: 'Omar Haddad',
  token: { cid: 'company1', crole: 'crew' },
};
/** Same company, not assigned to p1. */
export const otherCrew: TestUser = {
  uid: 'crew2',
  name: 'Nils Ek',
  token: { cid: 'company1', crole: 'crew' },
};
export const otherStaff: TestUser = {
  uid: 'other1',
  name: 'Karin Berg',
  token: { cid: 'company2', crole: 'owner' },
};
/** A client on p1. */
export const client: TestUser = {
  uid: 'client1',
  name: 'Anna Lindqvist',
  token: { kind: 'client' },
};
/** A client on another firm's project only. */
export const otherClient: TestUser = { uid: 'client2', name: 'Bo Berg', token: { kind: 'client' } };

export const everyone = [owner, admin, crew, otherCrew, otherStaff, client, otherClient];

export function media(projectId: string, id: string) {
  return {
    path: `projects/${projectId}/media/${id}/display.jpg`,
    thumbPath: `projects/${projectId}/media/${id}/thumb.jpg`,
    width: 2560,
    height: 1920,
    tags: [],
  };
}

export function newPost(author: TestUser, overrides: Record<string, unknown> = {}) {
  const isClient = author.token['kind'] === 'client';
  return {
    type: isClient ? 'question' : 'update',
    authorUid: author.uid,
    authorName: author.name,
    authorRole: isClient ? 'client' : author.token['crole'],
    text: isClient ? 'När kommer elektrikern?' : 'Rivningen är klar.',
    media: [],
    visibility: 'all',
    milestone: null,
    commentCount: 0,
    unanswered: isClient,
    createdAt: serverTimestamp(),
    editedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

export function newComment(author: TestUser, overrides: Record<string, unknown> = {}) {
  return {
    authorUid: author.uid,
    authorName: author.name,
    authorRole: author.token['kind'] === 'client' ? 'client' : author.token['crole'],
    text: 'Tack!',
    media: [],
    createdAt: serverTimestamp(),
    editedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

const branding = {
  name: 'Ek & Lind Snickeri',
  logoUrl: null,
  accentColor: '#127A69',
  showSitelineFooter: false,
};
const totals = { approvedExtraWorkOre: 0, openDecisions: 0, unansweredQuestions: 0 };

export function projectDoc(companyId: string, crewUids: string[], clientUids: string[]) {
  const roles = Object.fromEntries([
    ...crewUids.map((u) => [u, 'crew']),
    ...clientUids.map((u) => [u, 'client']),
  ]);
  return {
    companyId,
    kind: 'project',
    title: 'Köksrenovering Lindqvist',
    address: { street: 'Tallvägen 4', postalCode: '123 45', city: 'Stockholm' },
    schedule: null,
    status: 'active',
    startDate: '2026-10-01',
    endDate: null,
    branding,
    roles,
    clientUids,
    crewUids,
    totals,
    nextVisitId: null,
    lastPostAt: null,
    completedAt: null,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
}

/** Companies, users, projects p1 (company1) and p2 (company2), and some posts and comments. */
export async function seed(env: RulesTestEnvironment): Promise<void> {
  await env.withSecurityRulesDisabled(async (context: RulesTestContext) => {
    const db = context.firestore();
    const now = Timestamp.now();
    for (const user of everyone) {
      await setDoc(doc(db, `users/${user.uid}`), {
        kind: user.token['kind'] === 'client' ? 'client' : 'staff',
        name: user.name,
        phoneE164: null,
        email: null,
        locale: 'sv',
        companyId: user.token['cid'] ?? null,
        createdAt: now,
        updatedAt: now,
      });
    }
    await setDoc(doc(db, 'companies/company1'), {
      name: 'Ek & Lind Snickeri',
      orgNumber: null,
      logoPath: null,
      accentColor: '#127A69',
      locale: 'sv',
      timeZone: 'Europe/Stockholm',
      plan: 'free',
      compedUntil: null,
      limits: { activeProjects: 1, serviceClients: 3, staff: 1, smsPerMonth: 30 },
      usage: { activeProjects: 1, serviceClients: 0, staff: 4, smsThisMonth: 0 },
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
    await setDoc(doc(db, 'companies/company1/staff/owner1'), {
      role: 'owner',
      name: 'Erik Ek',
      notify: {},
      updatedAt: now,
    });
    await setDoc(doc(db, 'companies/company1/staff/crew1'), {
      role: 'crew',
      name: 'Omar Haddad',
      notify: {},
      updatedAt: now,
    });
    await setDoc(doc(db, 'companies/company1/private/billing'), { status: 'active' });
    await setDoc(doc(db, 'projects/p1'), projectDoc('company1', ['crew1'], ['client1']));
    await setDoc(doc(db, 'projects/p2'), projectDoc('company2', [], ['client2']));
    await setDoc(doc(db, 'projects/p1/members/client1'), {
      role: 'client',
      name: 'Anna Lindqvist',
      phoneMasked: '+46 70 *** ** 05',
      joinedAt: now,
      lastSeenAt: null,
      notify: { instant: false, digest: true, channel: 'sms' },
      phoneVerifiedAt: null,
      invite: null,
      createdAt: now,
    });
    await setDoc(doc(db, 'projects/p1/members/crew1'), {
      role: 'crew',
      name: 'Omar Haddad',
      notify: { instant: true, digest: false, channel: 'push' },
    });
    await setDoc(doc(db, 'projects/p1/posts/update1'), { ...newPost(owner), createdAt: now });
    await setDoc(doc(db, 'projects/p1/posts/question1'), { ...newPost(client), createdAt: now });
    await setDoc(doc(db, 'projects/p1/posts/update1/comments/c1'), {
      ...newComment(client),
      createdAt: now,
    });
    await setDoc(doc(db, 'projects/p1/approvals/a1'), { outcome: 'approved' });
    for (const path of [
      'invites/hash1',
      'outbox/m1',
      'devOutbox/m1',
      'events/e1',
      'referrals/code1',
      'rateLimits/r1',
      'clientPhones/x1',
    ]) {
      await setDoc(doc(db, path), { x: 1 });
    }
  });
}

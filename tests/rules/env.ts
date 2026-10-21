import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';

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
  token: Record<string, string>;
}

export const owner: TestUser = { uid: 'owner1', token: { cid: 'company1', crole: 'owner' } };
export const crew: TestUser = { uid: 'crew1', token: { cid: 'company1', crole: 'crew' } };
export const otherStaff: TestUser = { uid: 'other1', token: { cid: 'company2', crole: 'owner' } };
export const client: TestUser = { uid: 'client1', token: { kind: 'client' } };

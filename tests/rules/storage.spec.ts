import { getBytes, ref, uploadString } from 'firebase/storage';
import { assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';

import { client, createRulesEnv, owner } from './env';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await createRulesEnv();
});

afterAll(async () => {
  await env.cleanup();
});

describe('storage', () => {
  const paths = [
    'companies/company1/logo.png',
    'projects/p1/media/m1/display.jpg',
    'projects/p1/audio/a1.webm',
    'projects/p1/handover/handover-v1.pdf',
  ];

  it.each(paths)('denies reading and writing %s until the feature opens it', async (path) => {
    for (const user of [owner, client]) {
      const storage = env.authenticatedContext(user.uid, user.token).storage();
      await assertFails(uploadString(ref(storage, path), 'x'));
      await assertFails(getBytes(ref(storage, path)));
    }
    await assertFails(getBytes(ref(env.unauthenticatedContext().storage(), path)));
  });
});

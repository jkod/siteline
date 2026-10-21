import { getBytes, ref, uploadBytes, uploadString } from 'firebase/storage';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

import {
  admin,
  client,
  createRulesEnv,
  crew,
  otherClient,
  otherCrew,
  otherStaff,
  owner,
  seed,
  type TestUser,
} from './env';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await createRulesEnv();
  await env.clearFirestore();
  await seed(env);
  await env.withSecurityRulesDisabled(async (context) => {
    await uploadString(ref(context.storage(), 'projects/p1/media/m1/display.jpg'), 'x', 'raw', {
      contentType: 'image/jpeg',
    });
  });
});

afterAll(async () => {
  await env.cleanup();
});

function storageAs(user: TestUser | null) {
  return user
    ? env.authenticatedContext(user.uid, user.token).storage()
    : env.unauthenticatedContext().storage();
}

const jpeg = { contentType: 'image/jpeg' };

describe('project photos', () => {
  const path = 'projects/p1/media/m1/display.jpg';

  it('lets project members read photos', async () => {
    for (const user of [owner, admin, crew, client]) {
      await assertSucceeds(getBytes(ref(storageAs(user), path)));
    }
  });

  it('denies outsiders', async () => {
    for (const user of [otherCrew, otherStaff, otherClient, null]) {
      await assertFails(getBytes(ref(storageAs(user), path)));
    }
  });

  it('lets staff on the project and clients upload JPEG display and thumb files', async () => {
    for (const [user, id] of [
      [owner, 'a'],
      [crew, 'b'],
      [client, 'c'],
    ] as const) {
      await assertSucceeds(
        uploadString(ref(storageAs(user), `projects/p1/media/${id}/display.jpg`), 'x', 'raw', jpeg),
      );
      await assertSucceeds(
        uploadString(ref(storageAs(user), `projects/p1/media/${id}/thumb.jpg`), 'x', 'raw', jpeg),
      );
    }
  });

  it('denies outsiders, other file names, other types and files over 10 MB', async () => {
    await assertFails(
      uploadString(ref(storageAs(otherCrew), 'projects/p1/media/d/display.jpg'), 'x', 'raw', jpeg),
    );
    await assertFails(
      uploadString(
        ref(storageAs(otherClient), 'projects/p1/media/d/display.jpg'),
        'x',
        'raw',
        jpeg,
      ),
    );
    await assertFails(
      uploadString(ref(storageAs(owner), 'projects/p1/media/d/original.jpg'), 'x', 'raw', jpeg),
    );
    await assertFails(
      uploadString(ref(storageAs(owner), 'projects/p1/media/d/display.jpg'), 'x', 'raw', {
        contentType: 'image/png',
      }),
    );
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    await assertFails(
      uploadBytes(ref(storageAs(owner), 'projects/p1/media/d/display.jpg'), big, jpeg),
    );
  });
});

describe('company logo', () => {
  const png = { contentType: 'image/png' };

  it('lets owners and admins upload a logo up to 2 MB', async () => {
    await assertSucceeds(
      uploadString(ref(storageAs(owner), 'companies/company1/logo.png'), 'x', 'raw', png),
    );
    await assertSucceeds(
      uploadString(ref(storageAs(admin), 'companies/company1/logo.svg'), '<svg/>', 'raw', {
        contentType: 'image/svg+xml',
      }),
    );
    await assertSucceeds(getBytes(ref(storageAs(crew), 'companies/company1/logo.png')));
  });

  it('denies crew, clients, other companies, other names and big files', async () => {
    await assertFails(
      uploadString(ref(storageAs(crew), 'companies/company1/logo.png'), 'x', 'raw', png),
    );
    await assertFails(
      uploadString(ref(storageAs(client), 'companies/company1/logo.png'), 'x', 'raw', png),
    );
    await assertFails(
      uploadString(ref(storageAs(otherStaff), 'companies/company1/logo.png'), 'x', 'raw', png),
    );
    await assertFails(
      uploadString(ref(storageAs(owner), 'companies/company1/banner.png'), 'x', 'raw', png),
    );
    await assertFails(
      uploadBytes(
        ref(storageAs(owner), 'companies/company1/logo.png'),
        new Uint8Array(2 * 1024 * 1024 + 1),
        png,
      ),
    );
    await assertFails(getBytes(ref(storageAs(client), 'companies/company1/logo.png')));
  });
});

describe('paths not opened yet', () => {
  it.each([
    'projects/p1/audio/a1.webm',
    'projects/p1/attachments/f1/manual.pdf',
    'projects/p1/handover/handover-v1.pdf',
  ])('denies %s', async (path) => {
    await assertFails(
      uploadString(ref(storageAs(owner), path), 'x', 'raw', { contentType: 'application/pdf' }),
    );
    await assertFails(getBytes(ref(storageAs(owner), path)));
  });
});

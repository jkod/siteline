import { Timestamp } from 'firebase-admin/firestore';

import type { PushMessage } from '../../functions/src/adapters/types';
import { deliver } from '../../functions/src/lib/delivery';
import { queueMessage, queuePush } from '../../functions/src/lib/outbox';
import { clientChannel } from '../../functions/src/lib/recipients';
import { db, outbox, resetEmulators } from './harness';

beforeEach(resetEmulators);

function fakeSenders(invalid: string[] = []) {
  const pushes: PushMessage[] = [];
  const emails: { html?: string }[] = [];
  return {
    pushes,
    emails,
    senders: {
      sms: () => ({ send: async () => ({ providerMessageId: 'sms' }) }),
      email: () => ({
        send: async (m: { html?: string }) => (emails.push(m), { providerMessageId: 'email' }),
      }),
      push: () => ({
        send: async (m: PushMessage) => (
          pushes.push(m),
          { providerMessageId: 'push-1', invalidTokens: invalid }
        ),
      }),
    },
  };
}

const message = {
  recipientKind: 'staff' as const,
  template: 'clientQuestion' as const,
  params: { client: 'Anna', project: 'Kök', link: 'http://localhost:4300/app/projects/p1?post=q1' },
  locale: 'sv' as const,
  companyId: 'c1',
  projectId: 'p1',
  dedupeKey: 'question:q1:erik',
};

async function device(uid: string, id: string, token: string) {
  await db
    .doc(`users/${uid}/devices/${id}`)
    .set({ fcmToken: token, platform: 'web', lastSeenAt: Timestamp.now() });
}

describe('web push', () => {
  it('is queued only for people with a device', async () => {
    expect(await queuePush(db, { ...message, to: { uid: 'erik' } })).toBe(false);
    await device('erik', 'd1', 'token-1');
    expect(await queuePush(db, { ...message, to: { uid: 'erik' } })).toBe(true);
    const [queued] = await outbox();
    expect(queued).toMatchObject({ channel: 'push', dedupeKey: 'question:q1:erik:push' });
  });

  it('goes to every device with the title, a short body and the link, and forgets dead ones', async () => {
    await device('erik', 'd1', 'token-1');
    await device('erik', 'd2', 'token-dead');
    await queuePush(db, { ...message, to: { uid: 'erik' } });
    const { pushes, senders } = fakeSenders(['token-dead']);
    const [queued] = await outbox();
    await deliver(db, queued!.id, senders);
    expect(pushes).toHaveLength(1);
    expect(pushes[0]!.tokens.sort()).toEqual(['token-1', 'token-dead']);
    expect(pushes[0]!.link).toBe(message.params.link);
    expect(pushes[0]!.body).not.toContain('http');
    expect(pushes[0]!.title).toBeTruthy();
    expect((await outbox())[0]).toMatchObject({ status: 'sent', providerMessageId: 'push-1' });
    expect((await db.doc('users/erik/devices/d2').get()).exists).toBe(false);
    expect((await db.doc('users/erik/devices/d1').get()).exists).toBe(true);
  });

  it('is suppressed when the devices are gone by the time it sends', async () => {
    await device('erik', 'd1', 'token-1');
    await queuePush(db, { ...message, to: { uid: 'erik' } });
    await db.doc('users/erik/devices/d1').delete();
    const { pushes, senders } = fakeSenders();
    await deliver(db, (await outbox())[0]!.id, senders);
    expect(pushes).toHaveLength(0);
    expect((await outbox())[0]).toMatchObject({ status: 'suppressed', error: 'no_devices' });
  });

  it('is a client channel only with a device; otherwise text, then email', async () => {
    const user = {
      kind: 'client',
      name: 'Anna',
      phoneE164: '+46701740605',
      email: 'a@example.com',
      locale: 'sv',
    } as never;
    const member = (channel: string) =>
      ({ notify: { instant: false, digest: true, channel } }) as never;
    expect(await clientChannel(db, 'anna', user, member('push'))).toBe('sms');
    await device('anna', 'd1', 'token-a');
    expect(await clientChannel(db, 'anna', user, member('push'))).toBe('push');
    expect(await clientChannel(db, 'anna', user, member('email'))).toBe('email');
  });
});

describe('email', () => {
  it('goes out with an HTML part next to the plain text', async () => {
    await queueMessage(db, {
      ...message,
      channel: 'email',
      to: { uid: 'erik', email: 'erik@example.com' },
    });
    const { emails, senders } = fakeSenders();
    await deliver(db, (await outbox())[0]!.id, senders);
    expect(emails[0]!.html).toContain('<a href="http://localhost:4300/app/projects/p1?post=q1"');
  });
});

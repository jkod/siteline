import { Timestamp } from 'firebase-admin/firestore';

import type { SpeechDrafter } from '../../functions/src/adapters';
import { createCompanyHandler } from '../../functions/src/callables/company';
import {
  createReferralHandler,
  openReferralHandler,
} from '../../functions/src/callables/referrals';
import {
  discardVoiceDraftHandler,
  draftFromVoiceHandler,
} from '../../functions/src/callables/voice';
import { bucket } from '../../functions/src/lib/admin';
import { aggregateMetrics, purgeVoiceAudio } from '../../functions/src/scheduled/maintenance';
import { handlePostWritten } from '../../functions/src/triggers/posts';
import {
  addStaff,
  companyWithOwner,
  db,
  failure,
  request,
  resetEmulators,
  signedInUser,
  type TestCaller,
} from './harness';

beforeEach(resetEmulators);

const anna: TestCaller = { uid: 'anna', token: { kind: 'client' } };

async function project() {
  const owner = await companyWithOwner('c1', 'erik', 'team');
  await addStaff('c1', 'omar', 'crew', 'Omar Haddad');
  await db.doc('users/anna').set({
    kind: 'client',
    name: 'Anna Lindqvist',
    phoneE164: '+46701740605',
    email: null,
    locale: 'sv',
  });
  await db.doc('projects/p1').set({
    companyId: 'c1',
    kind: 'project',
    status: 'active',
    title: 'Köksrenovering Lindqvist',
    clientUids: ['anna'],
    crewUids: [],
    branding: { name: 'Ek & Lind' },
  });
  return owner;
}

async function upload(audioId: string, size = 2048) {
  const path = `projects/p1/audio/${audioId}.webm`;
  await bucket().file(path).save(Buffer.alloc(size, 1), { contentType: 'audio/webm' });
  return path;
}

/** The reason a call failed with, such as 'not_on_project'. */
const reason = async (promise: Promise<unknown>) => (await failure(promise)).message;

const exists = async (path: string) => (await bucket().file(path).exists())[0];

describe('draftFromVoice (F5)', () => {
  const drafter = (draft: SpeechDrafter['draft']): SpeechDrafter => ({ draft });

  it('drafts from the uploaded audio in the company language and keeps it for a day', async () => {
    const owner = await project();
    const path = await upload('rec-00000001');
    const seen: unknown[] = [];
    const now = new Date('2026-11-02T10:00:00Z');
    const result = await draftFromVoiceHandler(
      request(owner, { projectId: 'p1', audioId: 'rec-00000001', format: 'webm' }),
      drafter(async (audio, locale) => {
        seen.push(audio, locale);
        return { transcript: 'skåpen är uppe', draft: 'Skåpen är uppe.' };
      }),
      now,
    );
    expect(result).toEqual({ transcript: 'skåpen är uppe', draft: 'Skåpen är uppe.' });
    expect(seen).toEqual([
      { uri: `gs://demo-siteline-test.appspot.com/${path}`, contentType: 'audio/webm' },
      'sv',
    ]);
    const voice = (await db.doc('projects/p1/voice/rec-00000001').get()).data()!;
    expect(voice['postId']).toBeNull();
    expect((voice['deleteAfter'] as Timestamp).toDate()).toEqual(new Date('2026-11-03T10:00:00Z'));
    const events = await db.collection('events').where('name', '==', 'voice_draft_created').get();
    expect(events.docs[0]!.data()).toMatchObject({ companyId: 'c1', props: { ok: true } });
  });

  it('falls back to no draft when the AI fails, so the user can still post', async () => {
    const owner = await project();
    await upload('rec-00000002');
    const result = await draftFromVoiceHandler(
      request(owner, { projectId: 'p1', audioId: 'rec-00000002', format: 'webm' }),
      drafter(async () => {
        throw new Error('model unavailable');
      }),
    );
    expect(result).toEqual({ transcript: null, draft: null });
  });

  it('is for staff on the project only, needs the audio, and uses each recording once', async () => {
    const owner = await project();
    const crew = await signedInUser('omar', 'omar@example.com', { cid: 'c1', crole: 'crew' });
    const ok = drafter(async () => ({ transcript: 't', draft: 'd' }));
    const input = { projectId: 'p1', audioId: 'rec-00000003', format: 'webm' };
    expect(await reason(draftFromVoiceHandler(request(anna, input), ok))).toBe('staff_only');
    expect(await reason(draftFromVoiceHandler(request(crew, input), ok))).toBe('not_on_project');
    expect(await reason(draftFromVoiceHandler(request(owner, input), ok))).toBe('audio_not_found');
    await upload('rec-00000003');
    await draftFromVoiceHandler(request(owner, input), ok);
    expect(await reason(draftFromVoiceHandler(request(owner, input), ok))).toBe(
      'audio_already_used',
    );
  });

  it('rejects recordings over 5 MB', async () => {
    const owner = await project();
    await upload('rec-00000004', 5 * 1024 * 1024 + 1);
    const ok = drafter(async () => ({ transcript: 't', draft: 'd' }));
    const input = { projectId: 'p1', audioId: 'rec-00000004', format: 'webm' };
    expect(await reason(draftFromVoiceHandler(request(owner, input), ok))).toBe('too_large');
  });

  it('deletes the audio at once when the draft is discarded', async () => {
    const owner = await project();
    const path = await upload('rec-00000005');
    const input = { projectId: 'p1', audioId: 'rec-00000005', format: 'webm' };
    await draftFromVoiceHandler(
      request(owner, input),
      drafter(async () => ({ transcript: 't', draft: 'd' })),
    );
    await expect(
      discardVoiceDraftHandler(request(owner, { projectId: 'p1', audioId: 'rec-00000005' })),
    ).resolves.toEqual({ deleted: true });
    expect(await exists(path)).toBe(false);
    expect((await db.doc('projects/p1/voice/rec-00000005').get()).exists).toBe(false);
  });

  it('keeps the audio 30 days after its post is published, then a nightly job deletes it', async () => {
    const owner = await project();
    const path = await upload('rec-00000006');
    const input = { projectId: 'p1', audioId: 'rec-00000006', format: 'webm' };
    await draftFromVoiceHandler(
      request(owner, input),
      drafter(async () => ({ transcript: 't', draft: 'd' })),
    );
    const createdAt = Timestamp.fromDate(new Date('2026-11-02T12:00:00Z'));
    const post = {
      type: 'update',
      authorUid: owner.uid,
      authorName: 'Erik Ek',
      authorRole: 'owner',
      text: 'Skåpen är uppe.',
      media: [],
      visibility: 'all',
      milestone: null,
      commentCount: 0,
      unanswered: false,
      createdAt,
      editedAt: null,
      deletedAt: null,
      voiceId: 'rec-00000006',
    };
    await db.doc('projects/p1/posts/post1').set(post);
    const after = await db.doc('projects/p1/posts/post1').get();
    await handlePostWritten(db, 'p1', 'post1', undefined, after);
    const voice = (await db.doc('projects/p1/voice/rec-00000006').get()).data()!;
    expect(voice['postId']).toBe('post1');
    expect((voice['deleteAfter'] as Timestamp).toDate()).toEqual(new Date('2026-12-02T12:00:00Z'));

    // A discard after publishing does nothing; the purge waits for the date.
    await discardVoiceDraftHandler(request(owner, { projectId: 'p1', audioId: 'rec-00000006' }));
    expect(await purgeVoiceAudio(db, new Date('2026-12-01T12:00:00Z'))).toBe(0);
    expect(await exists(path)).toBe(true);
    expect(await purgeVoiceAudio(db, new Date('2026-12-02T12:00:01Z'))).toBe(1);
    expect(await exists(path)).toBe(false);
  });

  it('deletes unused drafts a day after recording', async () => {
    const owner = await project();
    const path = await upload('rec-00000007');
    const now = new Date('2026-11-02T10:00:00Z');
    await draftFromVoiceHandler(
      request(owner, { projectId: 'p1', audioId: 'rec-00000007', format: 'webm' }),
      drafter(async () => ({ transcript: 't', draft: 'd' })),
      now,
    );
    expect(await purgeVoiceAudio(db, new Date('2026-11-03T09:59:00Z'))).toBe(0);
    expect(await purgeVoiceAudio(db, new Date('2026-11-03T10:00:00Z'))).toBe(1);
    expect(await exists(path)).toBe(false);
  });
});

describe('client invites (F20)', () => {
  it('a client invites a business; the page shows only the first name they chose to share', async () => {
    await project();
    const { code, url } = await createReferralHandler(
      request(anna, { projectId: 'p1', businessKind: 'garden', showFirstName: true }),
    );
    expect(url).toBe(`http://localhost:4300/r/${code}`);
    const referral = (await db.doc(`referrals/${code}`).get()).data()!;
    expect(referral).toMatchObject({
      clientUid: 'anna',
      firstName: 'Anna',
      sourceCompanyId: 'c1',
      sourceProjectId: 'p1',
      businessKind: 'garden',
      signedUpCompanyId: null,
    });

    const page = await openReferralHandler(request(null, { code }));
    expect(page).toEqual({ firstName: 'Anna', businessKind: 'garden' });
    expect(JSON.stringify(page)).not.toMatch(/46701740605|Lindqvist/);
    expect((await db.doc(`referrals/${code}`).get()).get('openedCount')).toBe(1);

    const anonymous = await createReferralHandler(
      request(anna, { projectId: 'p1', businessKind: 'cleaning', showFirstName: false }),
    );
    expect(await openReferralHandler(request(null, { code: anonymous.code }))).toEqual({
      firstName: null,
      businessKind: 'cleaning',
    });
  });

  it('only clients of the project can invite', async () => {
    const owner = await project();
    const input = { projectId: 'p1', businessKind: 'garden', showFirstName: true };
    expect(await reason(createReferralHandler(request(owner, input)))).toBe('clients_only');
    const bo: TestCaller = { uid: 'bo', token: { kind: 'client' } };
    expect(await reason(createReferralHandler(request(bo, input)))).toBe('clients_only');
  });

  it('a company signing up from the link is attributed to the client and firm, once', async () => {
    await project();
    const { code } = await createReferralHandler(
      request(anna, { projectId: 'p1', businessKind: 'garden', showFirstName: false }),
    );
    const signUp = async (uid: string) => {
      const caller = await signedInUser(uid, `${uid}@example.com`);
      return createCompanyHandler(
        request(caller, {
          name: `Gröna ${uid}`,
          accentColor: '#2E7D32',
          locale: 'sv',
          ownerName: 'Lo Gran',
          referralCode: code,
        }),
      );
    };
    const first = await signUp('lo');
    expect((await db.doc(`companies/${first.companyId}`).get()).get('referredBy')).toEqual({
      code,
      companyId: 'c1',
      clientUid: 'anna',
    });
    expect((await db.doc(`referrals/${code}`).get()).get('signedUpCompanyId')).toBe(
      first.companyId,
    );
    expect((await db.doc('companies/c1').get()).get('referralSignups')).toBe(1);

    const second = await signUp('mi');
    expect((await db.doc(`companies/${second.companyId}`).get()).get('referredBy')).toBeNull();
    expect((await db.doc('companies/c1').get()).get('referralSignups')).toBe(1);
    const signups = await db.collection('events').where('name', '==', 'referral_signup').get();
    expect(signups.size).toBe(1);
  });

  it('an unknown code is not found', async () => {
    expect(await reason(openReferralHandler(request(null, { code: 'NOPE234567' })))).toBe(
      'referral_not_found',
    );
  });
});

describe('aggregateMetrics', () => {
  it('rolls yesterday’s events (Stockholm time) into counts per company', async () => {
    const at = (iso: string) => Timestamp.fromDate(new Date(iso));
    const event = (name: string, companyId: string | null, iso: string) =>
      db
        .collection('events')
        .add({ name, companyId, projectId: null, uid: null, role: null, props: {}, at: at(iso) });
    // 1 Nov in Stockholm runs from 31 Oct 23:00 to 1 Nov 23:00 UTC.
    await event('post_published', 'c1', '2026-10-31T23:30:00Z');
    await event('post_published', 'c1', '2026-11-01T12:00:00Z');
    await event('invite_shared', 'c1', '2026-11-01T22:59:00Z');
    await event('invite_link_opened', 'c2', '2026-11-01T08:00:00Z');
    await event('post_published', 'c1', '2026-10-31T22:59:00Z');
    await event('post_published', 'c1', '2026-11-01T23:00:00Z');

    expect(await aggregateMetrics(db, new Date('2026-11-02T00:30:00Z'))).toBe(2);
    expect((await db.doc('metrics/c1_2026-11-01').get()).data()).toEqual({
      companyId: 'c1',
      date: '2026-11-01',
      counts: { post_published: 2, invite_shared: 1 },
    });
    expect((await db.doc('metrics/c2_2026-11-01').get()).get('counts')).toEqual({
      invite_link_opened: 1,
    });
  });
});

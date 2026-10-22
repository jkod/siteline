import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { type CallableRequest, HttpsError, onCall } from 'firebase-functions/https';
import {
  type Company,
  discardVoiceDraftInput,
  type Project,
  VOICE_DAILY_LIMIT,
  VOICE_FORMATS,
  VOICE_MAX_BYTES,
  type VoiceDraft,
  voiceDraftInput,
} from '@siteline/shared';

import { type SpeechDrafter, speechDrafter } from '../adapters';
import { bucket, db } from '../lib/admin';
import { assertProjectStaff, requireStaff } from '../lib/context';
import { projectOrThrow } from '../lib/decisions';
import { callableOptions } from '../lib/env';
import { recordEvent } from '../lib/metrics';
import { enforceRateLimit } from '../lib/rate-limit';
import { parseInput } from '../lib/validate';

const DAY_MS = 86_400_000;

async function staffProject(request: CallableRequest<unknown>, projectId: string) {
  const caller = requireStaff(request);
  const project = projectOrThrow(
    (await db.doc(`projects/${projectId}`).get()).data() as Project | undefined,
  );
  assertProjectStaff(caller, project);
  return { caller, project };
}

/**
 * Turns a recording into a draft update (PRD F5). The audio is already in Storage; this records
 * it for deletion, then asks the drafter. When the AI fails, the caller gets the transcript if
 * there is one, or nothing, and writes the update by hand.
 */
export async function draftFromVoiceHandler(
  request: CallableRequest<unknown>,
  drafter: SpeechDrafter = speechDrafter(),
  now = new Date(),
) {
  const input = parseInput(voiceDraftInput, request.data);
  const { caller, project } = await staffProject(request, input.projectId);
  await enforceRateLimit(db, `voice:${caller.uid}`, VOICE_DAILY_LIMIT, DAY_MS, now.getTime());

  const path = `projects/${input.projectId}/audio/${input.audioId}.${input.format}`;
  const file = bucket().file(path);
  const [exists] = await file.exists();
  if (!exists) throw new HttpsError('not-found', 'audio_not_found');
  const [metadata] = await file.getMetadata();
  if (Number(metadata.size) > VOICE_MAX_BYTES)
    throw new HttpsError('invalid-argument', 'too_large');

  // Unused drafts go after a day; publishing extends it to 30 days after the post.
  const ref = db.doc(`projects/${input.projectId}/voice/${input.audioId}`);
  const voice: VoiceDraft<Timestamp | FieldValue> = {
    path,
    createdBy: caller.uid,
    postId: null,
    deleteAfter: Timestamp.fromMillis(now.getTime() + DAY_MS),
    createdAt: FieldValue.serverTimestamp(),
  };
  await ref.create(voice).catch(() => {
    throw new HttpsError('already-exists', 'audio_already_used');
  });

  const company = (await db.doc(`companies/${project.companyId}`).get()).data() as
    Company | undefined;
  const started = Date.now();
  let result: { transcript: string | null; draft: string | null };
  try {
    result = await drafter.draft(
      { uri: `gs://${bucket().name}/${path}`, contentType: VOICE_FORMATS[input.format] },
      company?.locale ?? 'sv',
    );
  } catch (error) {
    logger.error('Voice draft failed', { projectId: input.projectId, error: String(error) });
    result = { transcript: null, draft: null };
  }
  const ms = Date.now() - started;
  logger.info('Voice draft', { projectId: input.projectId, ms, ok: result.draft !== null });
  await recordEvent(db, {
    name: 'voice_draft_created',
    companyId: project.companyId,
    projectId: input.projectId,
    uid: caller.uid,
    role: caller.role,
    props: { ms, ok: result.draft !== null },
  });
  return result;
}

/** Deletes a draft's audio at once when the user throws the draft away (PRD F5). */
export async function discardVoiceDraftHandler(request: CallableRequest<unknown>) {
  const input = parseInput(discardVoiceDraftInput, request.data);
  const { caller } = await staffProject(request, input.projectId);
  const ref = db.doc(`projects/${input.projectId}/voice/${input.audioId}`);
  const voice = (await ref.get()).data() as VoiceDraft | undefined;
  if (!voice || voice.postId) return { deleted: false };
  if (voice.createdBy !== caller.uid) throw new HttpsError('permission-denied', 'not_yours');
  await bucket().file(voice.path).delete({ ignoreNotFound: true });
  await ref.delete();
  return { deleted: true };
}

export const draftFromVoice = onCall(
  { ...callableOptions, timeoutSeconds: 60, memory: '512MiB' },
  (request) => draftFromVoiceHandler(request),
);
export const discardVoiceDraft = onCall(callableOptions, discardVoiceDraftHandler);

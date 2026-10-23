import { type CallableRequest, onCall } from 'firebase-functions/https';
import { startDemoInput } from '@siteline/shared';

import { auth, db } from '../lib/admin';
import { callerIp } from '../lib/context';
import { randomToken } from '../lib/crypto';
import { createDemo } from '../lib/demo';
import { callableOptions } from '../lib/env';
import { enforceRateLimit } from '../lib/rate-limit';
import { parseInput } from '../lib/validate';

const NAME: Record<'sv' | 'en', string> = { sv: 'Alex Testsson', en: 'Alex Tester' };

/**
 * "Prova Siteline": makes a fresh sandbox, as a firm or as a client, and signs the visitor in
 * to it. The account has no email or phone, carries a demo claim and is deleted with the
 * sandbox after a few days. Five sandboxes per IP an hour.
 */
export async function startDemoHandler(request: CallableRequest<unknown>) {
  await enforceRateLimit(db, `demo:${callerIp(request)}`, 5, 60 * 60_000);
  const { kind, locale } = parseInput(startDemoInput, request.data);
  const uid = `demo-${randomToken()
    .slice(0, 20)
    .replace(/[^A-Za-z0-9]/g, 'x')}`;
  await auth.createUser({ uid, displayName: NAME[locale] });
  const record = await createDemo(db, kind, { uid, name: NAME[locale], locale });
  const claims =
    kind === 'firm'
      ? { cid: record.companyIds[0]!, crole: 'owner', demo: true }
      : { kind: 'client', demo: true };
  await auth.setCustomUserClaims(uid, claims);
  return { token: await auth.createCustomToken(uid, claims), kind };
}

export const startDemo = onCall(
  { ...callableOptions, timeoutSeconds: 60, memory: '512MiB' },
  startDemoHandler,
);

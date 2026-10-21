import { onCall } from 'firebase-functions/https';
import { logger } from 'firebase-functions/logger';
import { clientErrorSchema, redactPath } from '@siteline/shared';

import { callableOptions } from '../lib/env';
import { parseInput } from '../lib/validate';

/**
 * Records a browser error without personal data (PRD section 13). Paths are redacted again
 * here, in case an old client sends an invite token.
 */
export const logClientError = onCall(callableOptions, (request) => {
  const error = parseInput(clientErrorSchema, request.data);
  logger.error('client_error', {
    name: error.name,
    message: error.message,
    stack: error.stack,
    path: redactPath(error.path),
    release: error.release,
    signedIn: request.auth != null,
  });
  return { ok: true };
});

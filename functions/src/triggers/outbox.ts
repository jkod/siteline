import { onDocumentCreated } from 'firebase-functions/firestore';

import { emailSender, pushSender, smsSender } from '../adapters';
import { db } from '../lib/admin';
import { deliver } from '../lib/delivery';
import { messagingSecrets } from '../lib/env';

export const senders = { sms: smsSender, email: emailSender, push: pushSender };

/** Sends a new message at once when allowed; the sweeper picks up the rest (PRD section 9). */
export const onOutboxCreated = onDocumentCreated(
  { document: 'outbox/{messageId}', secrets: messagingSecrets },
  (event) => deliver(db, event.params.messageId, senders),
);

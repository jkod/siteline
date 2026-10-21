import { defineSecret, defineString } from 'firebase-functions/params';

/** True when running in the Firebase Emulator Suite. */
export const isEmulator = process.env['FUNCTIONS_EMULATOR'] === 'true';

/** Options shared by every callable: App Check is enforced outside the emulator (PRD section 10). */
export const callableOptions = {
  enforceAppCheck: !isEmulator,
};

/**
 * The web app's origin, used in every link we send. Set per project in functions/.env.<projectId>;
 * the app domain isn't chosen yet, so .env holds a placeholder.
 */
export const appUrl = defineString('APP_URL');

export const elksUsername = defineSecret('ELKS_USERNAME');
export const elksPassword = defineSecret('ELKS_PASSWORD');

/** Secrets for functions that deliver messages. The emulator uses the dev senders instead. */
export const messagingSecrets = isEmulator ? [] : [elksUsername, elksPassword];

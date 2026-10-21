/** True when running in the Firebase Emulator Suite. */
export const isEmulator = process.env['FUNCTIONS_EMULATOR'] === 'true';

/** Options shared by every callable: App Check is enforced outside the emulator (PRD section 10). */
export const callableOptions = {
  enforceAppCheck: !isEmulator,
};

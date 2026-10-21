import { defineConfig } from 'vitest/config';

// Run through `npm run test:rules`, which starts the Firestore and Storage emulators.
export default defineConfig({
  test: {
    globals: true,
    include: ['tests/rules/**/*.spec.ts'],
    fileParallelism: false,
    testTimeout: 15_000,
  },
});

import { defineConfig } from 'vitest/config';

// Callables and triggers against the Firestore, Auth and Storage emulators. Run through
// `npm run test:integration`, which starts them with firebase.test.json.
export default defineConfig({
  resolve: {
    alias: { '@siteline/shared': new URL('../../shared/src/index.ts', import.meta.url).pathname },
  },
  test: {
    globals: true,
    include: ['tests/integration/**/*.spec.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      APP_URL: 'http://localhost:4300',
      // The default bucket, as the Functions runtime would provide it.
      FIREBASE_CONFIG: JSON.stringify({
        projectId: 'demo-siteline-test',
        storageBucket: 'demo-siteline-test.appspot.com',
      }),
    },
  },
});

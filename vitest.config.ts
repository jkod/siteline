import { defineConfig } from 'vitest/config';

// Unit tests for shared/ and functions/. The web app runs its own through `ng test siteline`,
// and rules tests have their own config in tests/rules.
export default defineConfig({
  test: {
    globals: true,
    include: ['shared/src/**/*.spec.ts', 'functions/src/**/*.spec.ts'],
  },
});

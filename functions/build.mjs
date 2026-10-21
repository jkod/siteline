import { readFileSync } from 'node:fs';

import * as esbuild from 'esbuild';

// Bundles the functions with the code from ../shared, so this folder stays deployable on its
// own. Runtime dependencies listed in package.json stay external and are installed by Firebase.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const options = {
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: true,
  tsconfig: 'tsconfig.json',
  external: Object.keys(pkg.dependencies ?? {}),
  // Bundled CommonJS dependencies may call require().
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: 'info',
};

if (process.argv.includes('--watch')) {
  const context = await esbuild.context(options);
  await context.watch();
} else {
  await esbuild.build(options);
}

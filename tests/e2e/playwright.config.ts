import { defineConfig, devices } from '@playwright/test';

// Runs against the Emulator Suite: `npm run e2e` starts the emulators and seeds them, and the
// web server below starts the app unless `npm run dev` is already serving it.
export default defineConfig({
  testDir: '.',
  outputDir: '../../test-results',
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI']
    ? [['list'], ['html', { open: 'never', outputFolder: '../../playwright-report' }]]
    : 'list',
  use: {
    baseURL: 'http://localhost:4300',
    locale: 'sv-SE',
    timezoneId: 'Europe/Stockholm',
    // Our CSS turns transitions off under reduced motion, so axe never sees text mid-fade.
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npx ng serve siteline --configuration e2e --port 4300',
    url: 'http://localhost:4300',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});

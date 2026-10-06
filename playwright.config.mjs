import { defineConfig } from '@playwright/test';

// End-to-end tests load the built extension (dist/petty) into Chromium.
// Run `npm run build` first; CI does this automatically.
export default defineConfig({
  testDir: 'test/e2e',
  testMatch: '*.spec.mjs',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
  },
});

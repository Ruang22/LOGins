import { defineConfig, devices } from '@playwright/test';
import { e2eDatabaseUrl, requireDedicatedE2eDatabase } from './e2e/fixtures.mjs';

const databaseUrl = requireDedicatedE2eDatabase(e2eDatabaseUrl);

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run e2e:stack',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
    env: { ...process.env, E2E_DATABASE_URL: databaseUrl },
  },
});

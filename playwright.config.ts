import { defineConfig } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

mkdirSync('.cache', { recursive: true });
const database = process.env.PLAYWRIGHT_DEMO_DB ?? resolve(`.cache/walkthrough-${process.pid}-${Date.now()}.db`);
process.env.PLAYWRIGHT_DEMO_DB = database;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  metadata: { database },
  use: {
    baseURL: 'http://127.0.0.1:4747',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'node dist/server/index.js --demo',
    url: 'http://127.0.0.1:4747/api/health',
    env: { PORT: '4747', DEMO_DATABASE_PATH: database },
    reuseExistingServer: false,
    timeout: 30_000
  }
});

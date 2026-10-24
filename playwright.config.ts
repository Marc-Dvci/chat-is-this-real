import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:4747',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'node dist/server/index.js --demo',
    url: 'http://127.0.0.1:4747/api/health',
    env: { PORT: '4747' },
    reuseExistingServer: false,
    timeout: 30_000
  }
});

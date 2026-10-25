import { mkdir } from 'node:fs/promises';
import { createTestHarness } from 'wrangler';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { openDatabase } from '../src/store/database.js';
import { seedDemo } from '../src/demo/seed.js';
import { loadDemoCatalog } from '../src/demo/replay.js';
import { CheckStore } from '../src/store/check-store.js';
import { PublicResults } from '../src/server/public-result.js';
import { signResultRequest } from '../src/shared/result-signing.js';
import { publicReceiptSchema } from '../src/shared/schemas.js';

test('the actual local Worker renders a signed recorded result at desktop and gallery widths', async ({ browser }) => {
  test.setTimeout(90_000); process.env.WRANGLER_SEND_METRICS = 'false';
  const secret = 'ab'.repeat(32), nonce = 'public-browser-receipt-nonce-01';
  const server = createTestHarness({ workers: [{ configPath: 'worker/wrangler.toml', secrets: { RESULTS_SIGNING_KEY: secret } }] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await context.newPage(), errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message)); page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const db = openDatabase(':memory:');
  try {
    const { url } = await server.listen();
    seedDemo(db, loadDemoCatalog()); const job = new CheckStore(db).get('demo-check-claim-029'); if (!job) throw new Error('Missing recorded check.');
    const result = new PublicResults(db).project(job), body = JSON.stringify({ result }), time = String(Date.now());
    const signature = await signResultRequest(secret, 'POST', '/api/results', time, nonce, body);
    const response = await server.fetch('/api/results', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-results-time': time, 'x-results-nonce': nonce, 'x-results-signature': signature }, body });
    expect(response.status).toBe(201);
    const receipt = publicReceiptSchema.parse(await response.json()); await page.goto(new URL(`/r/${receipt.id}`, url).href);
    await expect(page.getByRole('heading', { name: result.claim, exact: true })).toBeVisible(); await expect(page.locator('.result-stamp')).toHaveText('REAL');
    if (result.type !== 'fact' || !result.evidence[0] || !result.sources[0]) throw new Error('Missing factual evidence.');
    await expect(page.locator('.explanation')).toHaveText(result.explanation); await expect(page.locator('.evidence-row mark')).toHaveText(result.evidence[0].excerpt);
    await expect(page.locator('.source-link')).toHaveAttribute('href', result.sources[0].url); await expect(page.locator('.public-footer')).toContainText('UTC');
    expect(await page.locator('body').textContent()).not.toContain('demo_viewer');
    await mkdir('e2e/screens', { recursive: true }); await page.screenshot({ path: 'e2e/screens/public-worker-wide.png', fullPage: true });
    let scan = await new AxeBuilder({ page }).analyze(); expect(scan.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([]);
    await page.setViewportSize({ width: 380, height: 900 }); await page.screenshot({ path: 'e2e/screens/public-worker-dock.png', fullPage: true });
    scan = await new AxeBuilder({ page }).analyze(); expect(scan.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([]);
    for (const id of ['demo-check-claim-003', 'demo-check-vod-promise']) {
      const next = new CheckStore(db).get(id); if (!next) throw new Error('Missing recorded receipt.');
      const recorded = new PublicResults(db).project(next), payload = JSON.stringify({ result: recorded }), stamp = String(Date.now()), unique = `${nonce}-${id}`;
      const signed = await signResultRequest(secret, 'POST', '/api/results', stamp, unique, payload);
      const saved = await server.fetch('/api/results', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-results-time': stamp, 'x-results-nonce': unique, 'x-results-signature': signed }, body: payload });
      expect(saved.status).toBe(201); const receipt = publicReceiptSchema.parse(await saved.json());
      await page.goto(new URL(`/r/${receipt.id}`, url).href); await expect(page.getByRole('heading', { name: recorded.claim, exact: true })).toBeVisible();
      await expect(page.locator('.result-stamp')).toHaveText(recorded.type === 'vod' ? "IT'S IN THE VOD" : 'NOT REAL');
      if (recorded.type === 'vod') {
        await expect(page.locator('.vod-quote')).toContainText(recorded.quote); await expect(page.getByRole('link', { name: 'Open Twitch clip' })).toHaveAttribute('href', recorded.clip!.clip_url!);
        await expect(page.getByRole('link', { name: 'Open VOD at this moment' })).toBeVisible(); await page.screenshot({ path: 'e2e/screens/public-worker-vod-dock.png', fullPage: true });
      }
      scan = await new AxeBuilder({ page }).analyze(); expect(scan.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([]);
    }
    expect(errors).toEqual([]);
  } finally { db.close(); await context.close().catch(() => undefined); await server.close(); }
});

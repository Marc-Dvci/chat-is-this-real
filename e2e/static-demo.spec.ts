import { mkdir, readFile } from 'node:fs/promises';
import { createTestHarness } from 'wrangler';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { demoCatalogSchema } from '../src/shared/schemas.js';

test('the static demo reuses verified results, queue, voting and presentation across two browser views', async ({ browser }) => {
  test.setTimeout(120_000); process.env.WRANGLER_SEND_METRICS = 'false';
  const server = createTestHarness({ workers: [{ configPath: 'worker/wrangler.toml', secrets: { RESULTS_SIGNING_KEY: 'ab'.repeat(32) } }] });
  const context = await browser.newContext({ viewport: { width: 1536, height: 1100 }, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage(), errors: string[] = [], requests: string[] = [];
  context.on('page', (child) => child.on('pageerror', (error) => errors.push(error.message))); page.on('pageerror', (error) => errors.push(error.message));
  context.on('request', (request) => requests.push(request.url()));
  try {
    const { url } = await server.listen(), address = new URL('/demo/', url).href;
    await page.goto(url.href); await expect(page.getByRole('heading', { level: 1 })).toContainText('RECEIPTS.');
    await expect(page.locator('.home-verdict')).toHaveText('NOT REAL');
    await mkdir('e2e/screens', { recursive: true }); await page.screenshot({ path: 'e2e/screens/home-wide.png', fullPage: true });
    let homeScan = await new AxeBuilder({ page }).analyze(); expect(homeScan.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([]);
    await page.setViewportSize({ width: 380, height: 900 }); await page.screenshot({ path: 'e2e/screens/home-dock.png', fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(380);
    homeScan = await new AxeBuilder({ page }).analyze(); expect(homeScan.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([]);
    await page.setViewportSize({ width: 1536, height: 1100 });
    await page.goto(address); await expect(page.getByRole('heading', { name: 'Show the receipts.' })).toBeVisible({ timeout: 20_000 });
    const catalog = demoCatalogSchema.parse(JSON.parse(await readFile('web-dist/demo-data.json', 'utf8')));
    await expect(page.locator('.check-queue li')).toHaveCount(catalog.cases.length);
    await mkdir('e2e/screens', { recursive: true });
    for (const key of ['showcase-fr', 'showcase-es']) {
      const item = catalog.cases.find((item) => item.key === key); if (!item) throw new Error('Missing recorded multilingual check.');
      await page.locator('.check-select').filter({ hasText: item.text }).click();
      await expect(page.locator('.check-detail .result-stamp')).toHaveText(key === 'showcase-fr' ? 'REAL' : 'NOT REAL');
      await expect(page.locator('.evidence-row mark').first()).toBeVisible();
      await page.screenshot({ path: `e2e/screens/static-${key}-wide.png`, fullPage: true });
    }
    const overlay = await context.newPage(); await overlay.goto(new URL('/demo/overlay', url).href);
    await page.locator('.check-select').filter({ hasText: 'The Sun is a star.' }).click(); await page.getByRole('button', { name: 'Show on stream', exact: true }).click();
    await expect(overlay.locator('.broadcast-stamp')).toHaveText('REAL'); await expect(overlay.locator('.overlay-root')).toHaveAttribute('data-job-id', 'demo-check-claim-029');
    await page.getByRole('button', { name: 'Hide now' }).click(); await expect(overlay.locator('.overlay-root')).toHaveAttribute('data-state', 'hidden');
    await page.locator('.chat-row .message-body').filter({ hasText: 'The Sun is a star.' }).first().click(); await page.getByRole('button', { name: 'Show', exact: true }).click();
    await page.getByRole('button', { name: 'Check', exact: true }).click(); await expect(overlay.locator('.overlay-root')).toHaveAttribute('data-state', 'checking');
    for (const name of ['Viewer 1', 'Viewer 2']) await page.locator('.scripted-votes>div').filter({ hasText: name }).getByRole('button', { name: '1 · REAL', exact: true }).click();
    await page.getByRole('button', { name: 'Show on stream', exact: true }).click(); await expect(page.getByRole('status')).toContainText('Waiting for the vote window');
    await expect(overlay.locator('.broadcast-stamp')).toHaveText('REAL', { timeout: 30_000 }); await expect(page.locator('.caller-scores')).toContainText('1 PT');
    await page.getByRole('button', { name: 'Hide now' }).click();
    for (const path of ['/library', '/settings']) {
      await page.goto(new URL(`/demo${path}`, url).href); await expect(page.getByRole('heading', { name: path === '/library' ? 'Stream library' : 'Settings', exact: true })).toBeVisible();
    }
    await page.setViewportSize({ width: 380, height: 900 }); await page.screenshot({ path: 'e2e/screens/static-settings-dock.png', fullPage: true });
    let scan = await new AxeBuilder({ page }).analyze(); expect(scan.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([]);
    await page.goto(new URL('/demo/r/demo-check-showcase-es', url).href); await expect(page.locator('.result-stamp')).toHaveText('NOT REAL');
    scan = await new AxeBuilder({ page }).analyze(); expect(scan.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(380);
    expect(requests.filter((request) => new URL(request).pathname.startsWith('/api/'))).toEqual([]);
    expect(requests.filter((request) => new URL(request).origin !== new URL(address).origin)).toEqual([]); expect(errors).toEqual([]);
  } finally { await context.close().catch(() => undefined); await server.close(); }
});

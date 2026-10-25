import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const index = process.argv.indexOf('--base'), address = new URL(index < 0 ? 'http://127.0.0.1:4750/' : process.argv[index + 1]!);
if (address.protocol !== 'https:' && !(['localhost', '127.0.0.1'].includes(address.hostname) && address.protocol === 'http:')) throw new Error('Use HTTPS or the loopback preview.');
const scope = address.protocol === 'https:' ? 'production' : 'local', directory = `data/deploy/${scope}`;
await mkdir(directory, { recursive: true });
const checks: { path: string; status: number }[] = [], errors: string[] = [], requests: string[] = [];
let passed = false;
const browser = await chromium.launch({ headless: true });
try {
  for (const [path, expected] of [['/', 200], ['/demo/', 200], ['/demo/library', 200], ['/demo/settings', 200], ['/demo/overlay', 200], ['/demo/r/demo-check-showcase-fr', 200], ['/api/session', 404], ['/.env', 404], ['/data/tokens.json', 404]] as const) {
    const response = await fetch(new URL(path, address)); checks.push({ path, status: response.status }); expect(response.status).toBe(expected);
    if (path === '/demo/') expect(response.headers.get('content-security-policy')).toContain("'wasm-unsafe-eval'");
  }
  const context = await browser.newContext({ viewport: { width: 1536, height: 1100 }, reducedMotion: 'reduce' });
  context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
  context.on('request', (request) => requests.push(request.url()));
  const page = await context.newPage();
  await page.goto(address.href); await expect(page.locator('.home-verdict')).toHaveText('NOT REAL');
  await page.screenshot({ path: `${directory}/home.png`, fullPage: true });
  const scan = async () => { const result = await new AxeBuilder({ page }).analyze(); expect(result.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([]); };
  await scan();
  await page.goto(new URL('/demo/', address).href); await expect(page.getByRole('heading', { name: 'Show the receipts.' })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.check-queue li')).toHaveCount(12);
  for (const [message, verdict] of [['stardew sur PC', 'REAL'], ['los arrays de JavaScript', 'NOT REAL']] as const) {
    await page.locator('.check-select').filter({ hasText: message }).click(); await expect(page.locator('.check-detail .result-stamp')).toHaveText(verdict);
  }
  const overlay = await context.newPage(); await overlay.goto(new URL('/demo/overlay', address).href);
  await page.locator('.check-select').filter({ hasText: 'The Sun is a star.' }).click(); await page.getByRole('button', { name: 'Show on stream', exact: true }).click();
  await expect(overlay.locator('.broadcast-stamp')).toHaveText('REAL'); await page.getByRole('button', { name: 'Hide now' }).click();
  await page.locator('.chat-row .message-body').filter({ hasText: 'The Sun is a star.' }).first().click(); await page.getByRole('button', { name: 'Show', exact: true }).click();
  await page.getByRole('button', { name: 'Check', exact: true }).click(); await expect(overlay.locator('.overlay-root')).toHaveAttribute('data-state', 'checking');
  for (const viewer of ['Viewer 1', 'Viewer 2']) await page.locator('.scripted-votes>div').filter({ hasText: viewer }).getByRole('button', { name: '1 · REAL', exact: true }).click();
  await page.getByRole('button', { name: 'Show on stream', exact: true }).click(); await expect(page.getByRole('status')).toContainText('Waiting for the vote window');
  await expect(overlay.locator('.broadcast-stamp')).toHaveText('REAL', { timeout: 30_000 }); await expect(page.locator('.caller-scores')).toContainText('1 PT');
  await page.screenshot({ path: `${directory}/desk.png`, fullPage: true }); await overlay.screenshot({ path: `${directory}/overlay.png`, omitBackground: true });
  await page.getByRole('button', { name: 'Hide now' }).click();
  for (const [path, heading] of [['library', 'Stream library'], ['settings', 'Settings']] as const) {
    await page.goto(new URL(`/demo/${path}`, address).href); await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible(); await scan();
  }
  await page.setViewportSize({ width: 380, height: 900 }); await page.screenshot({ path: `${directory}/settings-dock.png`, fullPage: true });
  await page.goto(new URL('/demo/r/demo-check-showcase-fr', address).href); await expect(page.locator('.result-stamp')).toHaveText('REAL'); await scan();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(380);
  await page.screenshot({ path: `${directory}/receipt-dock.png`, fullPage: true });
  expect(requests.filter((request) => new URL(request).origin !== address.origin)).toEqual([]);
  expect(requests.filter((request) => new URL(request).pathname.startsWith('/api/'))).toEqual([]); expect(errors).toEqual([]);
  await context.close(); passed = true;
} finally {
  await browser.close(); await writeFile(`${directory}/report.json`, JSON.stringify({ passed, created_at: new Date().toISOString(), base: address.href,
    hosting: 'Static Pages assets, without Functions or bindings', scripted_voters: true, http: checks, browser_errors: errors,
    external_requests: requests.filter((request) => new URL(request).origin !== address.origin), backend_requests: requests.filter((request) => new URL(request).pathname.startsWith('/api/')) }, null, 2));
}
console.info(`${scope} Pages probe passed: real shared-browser demo, voting, mobile receipt, routes and accessibility.`);

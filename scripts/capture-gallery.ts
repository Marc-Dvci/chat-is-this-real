import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { buildApp } from '../src/server/app.js';
import { loadDemoCatalog } from '../src/demo/replay.js';

const directory = 'data/gallery'; await mkdir(directory, { recursive: true });
const app = buildApp({ demo: true }), browser = await chromium.launch({ headless: true });
try {
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  const clearNotification = async () => { const close = page.getByRole('button', { name: 'Dismiss notification' }); if (await close.count()) await close.click(); };
  const shot = async (name: string) => { await clearNotification(); await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: `${directory}/${name}.png` }); };
  await page.goto(address); await page.getByRole('heading', { name: 'Show the receipts.' }).waitFor();
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click();
  await page.locator('.check-select').filter({ hasText: 'java + bedrock can play together' }).click(); await shot('desk');
  await page.locator('.check-detail').screenshot({ path: `${directory}/evidence-detail.png` });
  await page.getByRole('button', { name: 'Show on stream', exact: true }).click();
  const overlay = await context.newPage(); await overlay.goto(`${address}/overlay`);
  await overlay.locator('.broadcast-stamp').filter({ hasText: 'NOT REAL' }).waitFor();
  await overlay.screenshot({ path: `${directory}/overlay.png`, omitBackground: true });
  await page.getByRole('button', { name: 'Hide now' }).click();
  await page.locator('.check-select').filter({ hasText: 'you said 50 pushups for 100 subs earlier' }).click(); await shot('vod');
  await page.locator('.check-detail').screenshot({ path: `${directory}/vod-detail.png` });
  await page.getByRole('button', { name: 'Show on stream', exact: true }).click();
  await overlay.locator('.broadcast-stamp').filter({ hasText: "IT'S IN THE VOD" }).waitFor();
  await overlay.screenshot({ path: `${directory}/overlay-vod.png`, omitBackground: true });
  await page.getByRole('button', { name: 'Hide now' }).click();
  await page.locator('.chat-row .user-name').filter({ hasText: 'demo_viewer_1' }).first().click();
  await page.getByRole('checkbox', { name: 'Select history: The Sun is a', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Select history: star.', exact: true }).check(); await shot('history');
  await page.getByRole('button', { name: 'Close viewer history' }).click();
  await clearNotification();
  for (const language of ['fr', 'es']) {
    const sample = loadDemoCatalog().cases.find((item) => item.key === `showcase-${language}`); if (!sample) throw new Error('Missing gallery showcase.');
    await page.locator('.check-select').filter({ hasText: sample.text }).click();
    await page.locator('.check-detail').screenshot({ path: `${directory}/${language}.png` });
  }
  await page.getByRole('link', { name: 'Library', exact: true }).click(); await page.getByRole('heading', { name: 'Stream library' }).waitFor(); await shot('library');
  if (errors.length) throw new Error('A browser error interrupted gallery capture.');
  await writeFile(`${directory}/capture.json`, JSON.stringify({ source: 'Actual headless application capture', mode: 'Recorded outcomes; fictional chat; no model calls or Twitch posts.', viewport: { width: 1920, height: 1080 }, device_scale_factor: 2, errors, captured_at: new Date().toISOString() }, null, 2));
  await context.close();
} finally { await browser.close(); await app.close(); }
console.info('Captured the actual desk, overlay, VOD, history and multilingual details at 2×.');

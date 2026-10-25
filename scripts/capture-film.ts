import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, type Page } from '@playwright/test';
import { buildApp } from '../src/server/app.js';
import { loadDemoCatalog } from '../src/demo/replay.js';
import { checkJobSchema } from '../src/shared/schemas.js';

const directory = `data/film/capture-${Date.now()}`; await mkdir(directory, { recursive: true, mode: 0o700 });
const app = buildApp({ demo: true }), browser = await chromium.launch({ headless: true });
const address = await app.listen({ host: '127.0.0.1', port: 0 });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: directory, size: { width: 1920, height: 1080 } }, reducedMotion: 'no-preference' });
const page = await context.newPage(), started = performance.now();
const events: { name: string; at_s: number }[] = [], errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
const mark = (name: string) => { events.push({ name, at_s: (performance.now() - started) / 1000 }); console.info(`Film capture: ${name}.`); };
const hold = (milliseconds: number) => page.waitForTimeout(milliseconds);
const click = async (target: ReturnType<Page['getByRole']>) => { const box = await target.boundingBox(); if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 15 }); await target.click(); };
const catalog = loadDemoCatalog(), claim = catalog.cases.find((item) => item.key === 'showcase-en');
if (!claim) throw new Error('Missing recorded claim.');
try {
  await page.addInitScript(() => {
    addEventListener('DOMContentLoaded', () => {
      const cursor = document.createElement('div'); cursor.setAttribute('aria-hidden', 'true');
      cursor.style.cssText = 'position:fixed;width:24px;height:24px;border:2px solid white;border-radius:50%;background:#22d3ee55;pointer-events:none;z-index:2147483646;left:-50px;top:-50px;box-shadow:0 0 0 7px #22d3ee18';
      document.body.append(cursor); addEventListener('mousemove', (event) => { cursor.style.left = `${event.clientX - 12}px`; cursor.style.top = `${event.clientY - 12}px`; });
      addEventListener('mousedown', () => { cursor.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.8)', opacity: .5 }, { transform: 'scale(1)', opacity: 1 }], { duration: 350 }); });
    });
  });
  await page.goto(address); await page.getByRole('heading', { name: 'Show the receipts.' }).waitFor();
  await click(page.getByRole('button', { name: 'Reset demo', exact: true })); await hold(800);
  mark('desk-start'); await hold(2500); await page.screenshot({ path: `${directory}/desk.png`, fullPage: false });
  await click(page.locator('.check-select').filter({ hasText: claim.text })); await hold(1500); mark('evidence-start');
  await page.locator('.check-detail').scrollIntoViewIfNeeded(); await hold(3000);
  await page.screenshot({ path: `${directory}/evidence.png`, fullPage: false });
  await page.locator('.evidence-list').screenshot({ path: `${directory}/verified-excerpt.png` }); mark('evidence-end');
  await click(page.locator('.chat-row .message-body').filter({ hasText: claim.text }).first()); await click(page.getByRole('button', { name: 'Show', exact: true })); await hold(700);
  const queued = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/checks' && response.request().method() === 'POST');
  await click(page.getByRole('button', { name: 'Check', exact: true })); const job = checkJobSchema.parse(await (await queued).json()); mark('check-requested');
  await page.locator(`.check-detail[data-check-id="${job.id}"][data-state="ready"]`).waitFor();
  for (const [name, choice] of [['Viewer 1', '2 · NOT REAL'], ['Viewer 2', '2 · NOT REAL'], ['Viewer 3', '1 · REAL']] as const) {
    await click(page.locator('.scripted-votes>div').filter({ hasText: name }).getByRole('button', { name: choice, exact: true })); await hold(500);
  }
  mark('votes-cast'); await click(page.getByRole('button', { name: 'Show on stream', exact: true })); mark('reveal-approved');
  await page.locator(`.check-detail[data-check-id="${job.id}"][data-state="on_air"]`).waitFor({ timeout: 30_000 }); mark('vote-revealed');
  await hold(4000); await page.screenshot({ path: `${directory}/vote-result.png`, fullPage: false });
  await click(page.getByRole('button', { name: 'Hide now' }));
  await click(page.locator('.check-select').filter({ hasText: 'you said 50 pushups for 100 subs earlier' }));
  await page.locator('.check-detail').scrollIntoViewIfNeeded(); mark('vod-start'); await hold(4500);
  await page.screenshot({ path: `${directory}/vod.png`, fullPage: false }); await page.locator('.check-detail').screenshot({ path: `${directory}/vod-detail.png` });
  await click(page.getByRole('button', { name: 'Show on stream', exact: true })); await hold(1500); mark('vod-shown');
  const overlay = await context.newPage(); await overlay.goto(`${address}/overlay`); await overlay.locator('.broadcast-stamp').filter({ hasText: "IT'S IN THE VOD" }).waitFor();
  await overlay.screenshot({ path: `${directory}/overlay-vod.png`, omitBackground: true }); await overlay.close(); await click(page.getByRole('button', { name: 'Hide now' }));
  await page.locator('.chat-row .user-name').filter({ hasText: 'demo_viewer_1' }).first().click(); mark('history-start');
  await page.getByRole('checkbox', { name: 'Select history: The Sun is a', exact: true }).check(); await hold(700);
  await page.getByRole('checkbox', { name: 'Select history: star.', exact: true }).check(); await hold(2500);
  await page.screenshot({ path: `${directory}/history.png`, fullPage: false }); await click(page.getByRole('button', { name: 'Close viewer history' }));
  await click(page.getByRole('link', { name: 'Library', exact: true })); await page.getByRole('heading', { name: 'Stream library' }).waitFor(); mark('library-start'); await hold(2500);
  await page.screenshot({ path: `${directory}/library.png`, fullPage: false }); await click(page.getByRole('link', { name: 'Review desk', exact: true }));
  mark('end'); if (errors.length) throw new Error('A browser error interrupted film capture.');
} finally {
  await context.close(); const video = await page.video()?.path();
  await writeFile(`${directory}/capture.json`, JSON.stringify({ mode: 'Recorded product demonstration; scripted viewers; no model calls or Twitch posts.', source: 'Actual application browser capture', video, events, errors }, null, 2));
  await browser.close(); await app.close(); await writeFile('data/film/latest-capture.json', JSON.stringify({ directory }, null, 2));
}

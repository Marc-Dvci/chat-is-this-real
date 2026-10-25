import { DatabaseSync } from 'node:sqlite';
import { mkdir } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('dashboard, overlay and SQLite agree through voting and the approved reveal', async ({ browser }, info) => {
  test.setTimeout(60_000);
  const context = await browser.newContext({ viewport: { width: 1536, height: 1100 }, reducedMotion: 'reduce' });
  const desk = await context.newPage(), overlay = await context.newPage(), errors: string[] = [];
  for (const page of [desk, overlay]) { page.on('pageerror', (error) => errors.push(error.message)); page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); }); }
  const path: unknown = info.config.metadata.database;
  if (typeof path !== 'string') throw new Error('The browser test needs its own demo database.');
  const db = new DatabaseSync(path, { readOnly: true });
  await mkdir('e2e/screens', { recursive: true });
  const agree = async (phase: string, id: string) => {
    await expect(desk.locator('.desk-shell')).toHaveAttribute('data-presentation-state', phase);
    await expect(overlay.locator('.overlay-root')).toHaveAttribute('data-state', phase);
    const row: unknown = JSON.parse(String(db.prepare("SELECT value_json FROM settings WHERE key='presentation'").get()?.value_json));
    expect(row).toMatchObject({ phase, job_id: id });
    expect(await overlay.locator('.overlay-root').getAttribute('data-job-id')).toBe(id);
    expect(await desk.locator('.desk-shell').getAttribute('data-presentation-job-id')).toBe(id);
  };
  try {
    await desk.goto('/'); await desk.getByRole('button', { name: 'Reset demo', exact: true }).click(); await expect(desk.locator('.check-queue li')).toHaveCount(loadDemoCatalog().cases.length);
    await overlay.setViewportSize({ width: 1920, height: 1080 }); await overlay.goto('/overlay');
    await desk.getByRole('button', { name: 'Select message: The Sun is a star.', exact: true }).click(); await desk.getByRole('button', { name: 'Show', exact: true }).click();
    await expect(overlay.locator('.overlay-root')).toHaveAttribute('data-state', 'message');
    const response = desk.waitForResponse((item) => new URL(item.url()).pathname === '/api/checks' && item.request().method() === 'POST');
    await desk.getByRole('button', { name: 'Check', exact: true }).click();
    const job: unknown = await (await response).json(); if (!job || typeof job !== 'object' || !('id' in job) || typeof job.id !== 'string') throw new Error('Missing queued job.');
    const id = job.id;
    await agree('checking', id); await expect(desk.locator('.check-detail')).toHaveAttribute('data-state', 'ready');
    expect(db.prepare('SELECT state FROM check_jobs WHERE id=?').get(id)?.state).toBe('ready');
    await expect(overlay.locator('.broadcast-stamp')).toHaveCount(0);
    await overlay.screenshot({ path: 'e2e/screens/overlay-checking.png', omitBackground: true });
    const viewers = desk.locator('.scripted-votes > div');
    await viewers.nth(0).getByRole('button', { name: '1 · REAL', exact: true }).click();
    await viewers.nth(1).getByRole('button', { name: '2 · NOT REAL', exact: true }).click();
    await viewers.nth(2).getByRole('button', { name: '1 · REAL', exact: true }).click();
    await viewers.nth(0).getByRole('button', { name: '2 · NOT REAL', exact: true }).click();
    await expect(desk.locator('.desk-vote-count b').first()).toHaveText('2'); await expect(desk.locator('.desk-vote-count b').last()).toHaveText('1');
    expect(db.prepare('SELECT count(*) AS total FROM votes WHERE job_id=?').get(id)?.total).toBe(3);
    await overlay.screenshot({ path: 'e2e/screens/overlay-voting.png', omitBackground: true });
    await desk.getByRole('button', { name: 'Show on stream', exact: true }).click(); await agree('checking', id);
    await expect(desk.locator('.caller-scores li')).toHaveCount(0);
    await desk.getByRole('button', { name: 'Leaderboard', exact: true }).click();
    await expect(overlay.locator('.overlay-root')).toHaveAttribute('data-state', 'dwell', { timeout: 25_000 });
    await agree('dwell', id); await expect(desk.locator('.check-detail')).toHaveAttribute('data-state', 'on_air');
    expect(db.prepare('SELECT state FROM check_jobs WHERE id=?').get(id)?.state).toBe('on_air');
    await expect(overlay.locator('.broadcast-stamp')).toHaveText('REAL'); await expect(overlay.locator('.chat-call-summary')).toHaveText('CHAT SAID 67% REAL');
    await expect(desk.locator('.caller-scores li')).toHaveCount(2); await expect(overlay.locator('.broadcast-leaders>div')).toHaveCount(2);
    await overlay.screenshot({ path: 'e2e/screens/overlay-vote-result.png', omitBackground: true }); await desk.screenshot({ path: 'e2e/screens/desk-vote-result.png', fullPage: true });
    const scan = await new AxeBuilder({ page: overlay }).analyze(); expect(scan.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([]);
    await desk.getByRole('button', { name: 'Hide leaderboard', exact: true }).click(); await expect(overlay.locator('.broadcast-leaders')).toHaveCount(0);
    await desk.getByRole('button', { name: 'Leaderboard', exact: true }).click(); await expect(overlay.locator('.broadcast-leaders>div')).toHaveCount(2);
    await desk.getByRole('button', { name: 'Hide now' }).click(); await expect(overlay.locator('.overlay-root')).toHaveAttribute('data-state', 'hidden'); await expect(overlay.locator('.broadcast-leaders')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally { db.close(); await context.close().catch(() => undefined); }
});
import { loadDemoCatalog } from '../src/demo/replay.js';

import { afterEach, expect, it } from 'vitest';
import { buildApp } from '../src/server/app.js';
import { openDatabase } from '../src/store/database.js';
import { deskSnapshotSchema, overlayViewSchema, publicResultSchema } from '../src/shared/schemas.js';

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

it('replays recorded results, projects public evidence and clears an active source after a viewer purge', async () => {
  const app = buildApp({ demo: true }); apps.push(app);
  const headers = { 'x-dashboard-token': (await app.inject('/api/session')).json<{ csrf_token: string }>().csrf_token };
  const desk = deskSnapshotSchema.parse((await app.inject('/api/desk')).json());
  expect(desk.demo).toBe(true); expect(desk.messages.length).toBeGreaterThan(6);
  const id = 'demo-check-claim-029';
  const result = publicResultSchema.parse((await app.inject(`/api/results/${id}`)).json());
  expect(result.type).toBe('fact');
  expect(JSON.stringify(result)).not.toContain('demo_viewer');
  expect(JSON.stringify(result)).not.toContain('input_json');
  const shown = await app.inject({ method: 'POST', url: '/api/presentation', headers, payload: { action: 'show_check', id } });
  expect(shown.statusCode).toBe(200);
  expect(overlayViewSchema.parse(shown.json()).presentation).toMatchObject({ phase: 'dwell', job_id: id });
  expect((await app.inject({ method: 'POST', url: `/api/checks/${id}/post`, headers, payload: {} })).json()).toEqual({ posted: true, simulated: true });
  const purge = await app.inject({ method: 'POST', url: '/api/history/purge', headers, payload: { user_login: 'demo_viewer_1' } });
  expect(purge.statusCode).toBe(200);
  expect(overlayViewSchema.parse((await app.inject('/api/overlay')).json()).presentation.phase).toBe('hidden');
  expect((await app.inject(`/api/results/${id}`)).statusCode).toBe(409);
});

it('joins selected history messages in time order and requires explicit confirmation for sensitive results', async () => {
  const db = openDatabase(':memory:'); const app = buildApp({ db, demo: true }); apps.push(app);
  const headers = { 'x-dashboard-token': (await app.inject('/api/session')).json<{ csrf_token: string }>().csrf_token };
  try {
    const response = await app.inject({ method: 'POST', url: '/api/checks', headers, payload: { kind: 'real', message_ids: ['demo-split-1', 'demo-split-0'] } });
    expect(response.statusCode).toBe(202);
    const id = response.json<{ id: string }>().id;
    await expect.poll(async () => deskSnapshotSchema.parse((await app.inject('/api/desk')).json()).checks.find((job) => job.id === id)?.state).toBe('ready');
    const job = deskSnapshotSchema.parse((await app.inject('/api/desk')).json()).checks.find((item) => item.id === id)!;
    expect(job.input?.claim).toBe('The Sun is a star.');
    const row = db.prepare('SELECT outcome_json FROM check_jobs WHERE id=?').get(id);
    const outcome: unknown = JSON.parse(String(row?.outcome_json));
    if (!outcome || typeof outcome !== 'object') throw new Error('Missing stored result.');
    db.prepare('UPDATE check_jobs SET outcome_json=? WHERE id=?').run(JSON.stringify({ ...outcome, sensitive: true }), id);
    expect((await app.inject({ method: 'POST', url: '/api/presentation', headers, payload: { action: 'show_check', id } })).statusCode).toBe(409);
    expect((await app.inject({ method: 'POST', url: '/api/presentation', headers, payload: { action: 'show_check', id, sensitive_confirmed: true } })).statusCode).toBe(200);
  } finally { await app.close(); apps.splice(apps.indexOf(app), 1); db.close(); }
});

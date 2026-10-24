import { expect, it, vi } from 'vitest';
import { buildApp } from '../src/server/app.js';
import { openDatabase } from '../src/store/database.js';
import { deskSnapshotSchema, overlayViewSchema } from '../src/shared/schemas.js';

it('keeps a fast result private until the minimum and approval, then scores once and agrees with stored presentation state', async () => {
  const db = openDatabase(':memory:');
  let now = Date.now(); const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
  const app = buildApp({ db, demo: true });
  try {
    const headers = { 'x-dashboard-token': (await app.inject('/api/session')).json<{ csrf_token: string }>().csrf_token };
    const post = (url: string, payload: Record<string, unknown>) => app.inject({ method: 'POST', url, headers, payload });
    await post('/api/presentation', { action: 'show_message', message_ids: ['demo-message-claim-029'] });
    const id = (await post('/api/checks', { message_ids: ['demo-message-claim-029'], kind: 'real' })).json<{ id: string }>().id;
    await expect.poll(async () => deskSnapshotSchema.parse((await app.inject('/api/desk')).json()).checks.find((job) => job.id === id)?.state).toBe('ready');
    expect(overlayViewSchema.parse((await app.inject('/api/overlay')).json())).toMatchObject({ presentation: { phase: 'checking', job_id: id }, result: null, waiting_for_review: true });
    expect((await post('/api/demo/vote', { user: 'demo-user-1', text: '1' })).json()).toMatchObject({ accepted: true });
    expect((await post('/api/demo/vote', { user: 'demo-user-1', text: '2' })).json()).toMatchObject({ accepted: false });
    expect((await post('/api/demo/vote', { user: 'demo-user-2', text: '2' })).json()).toMatchObject({ accepted: true });
    const approved = overlayViewSchema.parse((await post('/api/presentation', { action: 'show_check', id })).json());
    expect(approved).toMatchObject({ presentation: { phase: 'checking' }, result: null, votes: { real: 1, not_real: 1, closed: false } });
    expect(deskSnapshotSchema.parse((await app.inject('/api/desk')).json()).scores).toEqual([]);
    now += 20_000;
    await expect.poll(async () => overlayViewSchema.parse((await app.inject('/api/overlay')).json()).presentation.phase).toBe('reveal');
    const overlay = overlayViewSchema.parse((await app.inject('/api/overlay')).json());
    const desk = deskSnapshotSchema.parse((await app.inject('/api/desk')).json());
    expect(desk.overlay).toEqual(overlay);
    expect(JSON.parse(String(db.prepare("SELECT value_json FROM settings WHERE key='presentation'").get()?.value_json))).toEqual(overlay.presentation);
    expect(db.prepare('SELECT state FROM check_jobs WHERE id=?').get(id)?.state).toBe('on_air');
    expect(desk.scores).toEqual([{ user_id: 'demo-user-1', display_name: 'demo_viewer_1', points: 1 }]);
    expect((await post('/api/demo/vote', { user: 'demo-user-3', text: '1' })).json()).toMatchObject({ accepted: false });
    await post('/api/presentation', { action: 'show_check', id });
    expect(deskSnapshotSchema.parse((await app.inject('/api/desk')).json()).scores[0]?.points).toBe(1);
    await post('/api/history/purge', { user_login: 'demo_viewer_1' });
    expect(deskSnapshotSchema.parse((await app.inject('/api/desk')).json()).scores).toEqual([]);
    expect((await app.inject({ url: '/api/overlay/events', headers: { origin: 'https://untrusted.example' } })).statusCode).toBe(403);
  } finally { await app.close(); db.close(); clock.mockRestore(); }
});

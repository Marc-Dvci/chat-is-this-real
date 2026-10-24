import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { buildApp } from '../src/server/app.js';
import { openDatabase } from '../src/store/database.js';
import { ChatStore } from '../src/store/chat-store.js';
import { RequestStore } from '../src/store/request-store.js';
import { SettingsStore } from '../src/store/settings-store.js';
import { ChatCore } from '../src/twitch/chat-core.js';
import { EventSubWs } from '../src/twitch/eventsub-ws.js';
import { chatSettingsSchema } from '../src/shared/schemas.js';

it('searches recorded history and removes its source and queued request through protected Fastify routes', async () => {
  const db = openDatabase(':memory:');
  const chat = new ChatStore(db), requests = new RequestStore(db), settings = new SettingsStore(db);
  const enabled = settings.set(chatSettingsSchema.parse({ history_enabled: true }));
  const core = new ChatCore(chat, requests, '900001', '900002', enabled, { onRequest: () => undefined });
  core.setStream('recorded-stream');
  const socket = new EventSubWs({ onSession: async () => undefined, onNotification: (frame) => core.handle(frame), onError: (error) => { throw error; } });
  const app = buildApp({ db, onSettings: (value) => core.configure(value) });
  try {
    for (const frame of (await readFile('fixtures/twitch/probe-1792830555944.jsonl', 'utf8')).trim().split('\n')) await socket.receive(frame);
    const found = await app.inject({ method: 'GET', url: '/api/history?user=900002&q=Moon' });
    expect(found.statusCode).toBe(200);
    expect(found.json<{ messages: unknown[] }>().messages).toHaveLength(1);
    expect((await app.inject({ method: 'POST', url: '/api/history/purge', payload: { user_id: '900002' } })).statusCode).toBe(403);
    const session = (await app.inject({ method: 'GET', url: '/api/session' })).json<{ csrf_token: string }>();
    const headers = { 'x-dashboard-token': session.csrf_token };
    const updated = await app.inject({ method: 'PATCH', url: '/api/settings', headers, payload: { retention_days: 7 } });
    expect(updated.json()).toMatchObject({ history_enabled: true, retention_days: 7 });
    const invalid = await app.inject({ method: 'PATCH', url: '/api/settings', headers, payload: { real_command: '!vod' } });
    expect(invalid.statusCode).toBe(400);
    const purged = await app.inject({ method: 'POST', url: '/api/history/purge', headers, payload: { user_id: '900002' } });
    expect(purged.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/history?q=Moon' })).json<{ messages: unknown[] }>().messages).toEqual([]);
    expect(requests.list()[0]).toMatchObject({ body: '', state: 'cancelled' });
  } finally { socket.close(); await app.close(); db.close(); }
});

it('rejects a rebound host and a foreign-origin mutation even with the session header', async () => {
  const app = buildApp();
  try {
    expect((await app.inject({ method: 'GET', url: '/api/history', headers: { host: 'untrusted.example' } })).statusCode).toBe(403);
    const session = (await app.inject({ method: 'GET', url: '/api/session' })).json<{ csrf_token: string }>();
    expect((await app.inject({ method: 'PATCH', url: '/api/settings', headers: { origin: 'https://untrusted.example', 'x-dashboard-token': session.csrf_token }, payload: { history_enabled: true } })).statusCode).toBe(403);
  } finally { await app.close(); }
});

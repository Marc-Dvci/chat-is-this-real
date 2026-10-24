import { expect, it, vi } from 'vitest';
import { buildApp } from '../src/server/app.js';

it('queues, inspects and dismisses a dashboard check through CSRF-protected routes without model credentials', async () => {
  vi.stubEnv('DASHSCOPE_API_KEY', '');
  const app = buildApp();
  try {
    const payload = { claim: 'The Moon is made of cheese.' };
    expect((await app.inject({ method: 'POST', url: '/api/checks', payload })).statusCode).toBe(403);
    const session = (await app.inject({ method: 'GET', url: '/api/session' })).json<{ csrf_token: string }>();
    const headers = { 'x-dashboard-token': session.csrf_token };
    expect((await app.inject({ method: 'POST', url: '/api/checks', headers, payload: {} })).statusCode).toBe(400);
    const queued = await app.inject({ method: 'POST', url: '/api/checks', headers, payload });
    expect(queued.statusCode).toBe(202);
    const id = queued.json<{ id: string }>().id;
    const jobs = (await app.inject({ method: 'GET', url: '/api/checks' })).json<{ checks: { id: string; state: string; reason: string }[] }>();
    expect(jobs.checks).toContainEqual(expect.objectContaining({ id, state: 'failed', reason: 'model_configuration' }));
    expect((await app.inject({ method: 'POST', url: `/api/checks/${id}/dismiss`, headers })).json()).toEqual({ dismissed: true });
    expect((await app.inject({ method: 'GET', url: '/api/twitch/status' })).json()).toEqual({ notice: 'twitch_disconnected', live_stream_id: null });
    expect((await app.inject({ method: 'POST', url: '/api/twitch/disconnect', headers })).statusCode).toBe(200);
  } finally { await app.close(); vi.unstubAllEnvs(); }
});

it('rejects a removed history source and a protected secret before queuing or calling a model', async () => {
  const app = buildApp();
  vi.stubEnv('TEST_API_KEY', 'unused-route-credential-value');
  try {
    const session = (await app.inject({ method: 'GET', url: '/api/session' })).json<{ csrf_token: string }>();
    const headers = { 'x-dashboard-token': session.csrf_token };
    expect((await app.inject({ method: 'POST', url: '/api/checks', headers, payload: { message_id: 'absent' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/api/checks', headers, payload: { claim: 'unused-route-credential-value' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/checks' })).json()).toEqual({ checks: [] });
  } finally { await app.close(); vi.unstubAllEnvs(); }
});

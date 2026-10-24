import Fastify from 'fastify';
import { readFile } from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
import { openDatabase } from '../src/store/database.js';
import { SegmentStore } from '../src/store/segment-store.js';
import { registerLibraryRoutes } from '../src/server/library-routes.js';
import { installDashboardSecurity } from '../src/server/security.js';
import { transcriptSegmentSchema, twitchVideosSchema } from '../src/shared/schemas.js';

it('imports generated captions from the real transcript through the protected library route', async () => {
  const db = openDatabase(':memory:'), segments = new SegmentStore(db), app = Fastify();
  const fixture: unknown = JSON.parse(await readFile('fixtures/twitch/library-videos.json', 'utf8'));
  if (!fixture || typeof fixture !== 'object' || !('response' in fixture)) throw new Error('Missing recorded VOD response.');
  const videos = twitchVideosSchema.parse(fixture.response).data;
  const video = videos[0]; if (!video) throw new Error('Missing recorded VOD.');
  const segment = transcriptSegmentSchema.parse(JSON.parse((await readFile('eval/vod/transcript.jsonl', 'utf8')).split('\n')[0] ?? ''));
  const text = `1\n00:00:00,000 --> 00:00:11,029\n${segment.text}\n`;
  installDashboardSecurity(app);
  registerLibraryRoutes(app, segments, { ownedVods: async () => videos, currentStreamId: () => undefined });
  try {
    const payload = { vod_id: video.id, format: 'srt', text };
    expect((await app.inject({ method: 'POST', url: '/api/library/subtitles', payload })).statusCode).toBe(403);
    const csrf = (await app.inject({ method: 'GET', url: '/api/session' })).json<{ csrf_token: string }>();
    const headers = { 'x-dashboard-token': csrf.csrf_token };
    const response = await app.inject({ method: 'POST', url: '/api/library/subtitles', headers, payload });
    expect(response.statusCode).toBe(201);
    expect(segments.all(`upload-${video.id}`)[0]?.text).toBe(segment.text);
    expect(segments.search(`upload-${video.id}`, 'camera')[0]?.text).toBe(segment.text);
    expect((await app.inject({ method: 'POST', url: '/api/library/subtitles', headers, payload: { ...payload, vod_id: '123' } })).statusCode).toBe(409);
    vi.stubEnv('TEST_API_KEY', 'unused-library-credential-value');
    expect((await app.inject({ method: 'POST', url: '/api/library/subtitles', headers, payload: { ...payload, text: text.replace(segment.text, 'unused-library-credential-value') } })).statusCode).toBe(400);
    expect(segments.all(`upload-${video.id}`)[0]?.text).toBe(segment.text);
    const rejected = await app.inject({ method: 'POST', url: `/api/library/${video.id}/media`, headers: { ...headers, 'Content-Type': 'application/octet-stream' }, payload: Buffer.from('This is not a media container.') });
    expect(rejected.statusCode).toBe(202);
    await vi.waitFor(() => expect((segments.db.prepare('SELECT data_json FROM media_imports').get()?.data_json ?? '')).toContain('failed'), { timeout: 10_000 });
  } finally { await app.close(); db.close(); vi.unstubAllEnvs(); }
});

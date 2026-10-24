import type { FastifyInstance } from 'fastify';
import type { SegmentStore } from '../store/segment-store.js';
import type { LiveSession } from './live-session.js';
import { companionConfigSchema, ingestTranscriptSchema, librarySearchSchema } from '../shared/schemas.js';
import { assertNoSecretFragments } from '../shared/format-chat.js';
import { loadedSecrets } from '../shared/secrets.js';
import { alignChunk, chunkOffset } from '../vod/align.js';

export function registerTranscriptRoutes(app: FastifyInstance, segments: SegmentStore, session: LiveSession): void {
  app.get('/api/companion/state', async (_request, reply) => {
    try {
      const state = await session.companionState();
      if (!state) return reply.code(409).send({ error: 'Connect Twitch during your live stream before starting the companion.' });
      return state;
    } catch { return reply.code(409).send({ error: 'Could not verify the current stream. Reconnect Twitch.' }); }
  });
  app.post('/api/transcript/chunk', async (request, reply) => {
    const value = ingestTranscriptSchema.safeParse(request.body);
    if (!value.success) return reply.code(400).send({ error: 'Check the transcript chunk and timestamps.' });
    try {
      assertNoSecretFragments(JSON.stringify(value.data), loadedSecrets());
      const state = await session.companionState();
      if (!state || state.broadcast_id !== value.data.broadcast_id) return reply.code(409).send({ error: 'The chunk does not belong to the current live stream.' });
      const item = value.data;
      if (Date.parse(item.chunk_wall_start) + item.duration_s * 1000 > Date.now() + 5000) return reply.code(400).send({ error: 'A transcript chunk cannot come from the future.' });
      const correction = companionConfigSchema.shape.VOD_OFFSET_CORRECTION_S.parse(process.env.VOD_OFFSET_CORRECTION_S);
      const raw = chunkOffset(item.chunk_wall_start, state.started_at, correction);
      segments.register({ id: state.broadcast_id, vod_id: state.vod_id, title: state.title,
        started_at: state.started_at, source: 'live', created_at: new Date().toISOString() });
      const segment = alignChunk({ id: item.chunk_id, broadcast_id: state.broadcast_id, vod_id: state.vod_id, duration_s: item.duration_s,
        text: item.text, words: item.words, source: 'live', created_at: new Date().toISOString() }, raw);
      if (segment) {
        if (segment.text.trim()) segments.put(segment);
        else segments.cover(state.broadcast_id, segment.offset_s, segment.offset_s + segment.duration_s);
      }
      return { accepted: true, indexed: Boolean(segment?.text.trim()), coverage: segments.coverage(state.broadcast_id) };
    } catch { return reply.code(400).send({ error: 'The transcript was not stored. Check alignment and protected text.' }); }
  });
  app.get('/api/library', async () => ({ broadcasts: segments.broadcasts().map((broadcast) => ({ ...broadcast, coverage: segments.coverage(broadcast.id) })) }));
  app.get('/api/library/vods', async (_request, reply) => {
    try { return { videos: await session.ownedVods() }; }
    catch { return reply.code(409).send({ error: 'Connect Twitch to choose one of your past broadcasts.' }); }
  });
  app.get('/api/library/segments', async (request, reply) => {
    const query = librarySearchSchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Check the library filters.' });
    const broadcast = query.data.broadcast_id;
    return { segments: broadcast ? (query.data.q.trim() ? segments.search(broadcast, query.data.q) : segments.all(broadcast).slice(0, 200)) : [] };
  });
}

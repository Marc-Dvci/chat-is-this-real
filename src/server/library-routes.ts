import type { FastifyInstance } from 'fastify';
import type { LiveSession } from './live-session.js';
import type { SegmentStore } from '../store/segment-store.js';
import { subtitleUploadSchema } from '../shared/schemas.js';
import { assertNoSecretFragments } from '../shared/format-chat.js';
import { loadedSecrets } from '../shared/secrets.js';
import { parseSubtitles } from '../vod/subtitles.js';
import { transaction } from '../store/database.js';
import { Readable } from 'node:stream';
import { libraryParamsSchema } from '../shared/schemas.js';
import { MediaImports } from '../vod/media-imports.js';

export function registerLibraryRoutes(app: FastifyInstance, segments: SegmentStore, session: Pick<LiveSession, 'ownedVods' | 'currentStreamId'>): void {
  const imports = new MediaImports(segments);
  app.addContentTypeParser('application/octet-stream', (_request, stream, done) => done(null, stream));
  app.get('/api/library/imports', async () => ({ imports: imports.list() }));
  app.post('/api/library/:vod_id/media', async (request, reply) => {
    const params = libraryParamsSchema.safeParse(request.params);
    if (!params.success || !(request.body instanceof Readable)) return reply.code(400).send({ error: 'Choose a media file and one of your past broadcasts.' });
    if (imports.busy()) return reply.code(409).send({ error: 'Wait for the current media import.' });
    try {
      const video = (await session.ownedVods()).find((item) => item.id === params.data.vod_id);
      if (!video || video.stream_id === session.currentStreamId()) return reply.code(409).send({ error: 'Choose one of your past broadcasts.' });
      return reply.code(202).send(await imports.receive(video, request.body));
    } catch { return reply.code(400).send({ error: 'The media upload was not accepted. Use a supported file under 2 GB.' }); }
  });
  app.addHook('onClose', async () => imports.close());
  app.post('/api/library/subtitles', async (request, reply) => {
    const parsed = subtitleUploadSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Choose an SRT, VTT or timestamped TXT file and one of your VODs.' });
    try {
      const cues = parseSubtitles(parsed.data.text, parsed.data.format);
      assertNoSecretFragments(JSON.stringify(cues), loadedSecrets());
      const videos = await session.ownedVods(), video = videos.find((item) => item.id === parsed.data.vod_id);
      if (!video || video.stream_id === session.currentStreamId()) return reply.code(409).send({ error: 'Choose one of your past broadcasts.' });
      const id = `upload-${video.id}`, now = new Date().toISOString();
      transaction(segments.db, () => {
        segments.remove(id);
        segments.register({ id, vod_id: video.id, title: video.title, started_at: video.created_at, source: 'upload', created_at: now });
        cues.forEach((cue, index) => segments.put({ id: `${id}-cue-${index}`, broadcast_id: id, vod_id: video.id,
          offset_s: cue.start, duration_s: cue.end - cue.start, text: cue.text, words: [], source: 'upload', created_at: now }));
      });
      return reply.code(201).send({ broadcast: segments.broadcast(id), coverage: segments.coverage(id) });
    } catch { return reply.code(400).send({ error: 'The subtitles were not imported. Check timestamps, Twitch connection and protected text.' }); }
  });
}

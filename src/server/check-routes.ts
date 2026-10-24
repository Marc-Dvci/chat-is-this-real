import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { CheckService } from '../check/service.js';
import { checkIdParamsSchema, checkViewSchema, clipApprovalSchema, createCheckSchema, type ChatSettings, type DemoCatalog } from '../shared/schemas.js';
import { assertNoSecretFragments } from '../shared/format-chat.js';
import { loadedSecrets } from '../shared/secrets.js';
import { ChatStore } from '../store/chat-store.js';
import { RequestStore } from '../store/request-store.js';
import { SettingsStore } from '../store/settings-store.js';
import { SegmentStore } from '../store/segment-store.js';
import { LiveSession } from './live-session.js';
import { registerTranscriptRoutes } from './transcript-routes.js';
import { createVodClip, vodTimestampUrl } from '../vod/clips.js';
import { registerLibraryRoutes } from './library-routes.js';
import { DemoSession } from '../demo/session.js';
import { demoReplay } from '../demo/replay.js';

export function registerCheckRoutes(app: FastifyInstance, db: DatabaseSync, catalog?: DemoCatalog) {
  const clips = new Map<string, { abort: AbortController; done: Promise<void> }>();
  const checks = new CheckService(db, (job) => {
    if (job.reason === 'source_removed' || job.state === 'dismissed') clips.get(job.id)?.abort.abort();
  }, catalog ? demoReplay(catalog) : undefined), chat = new ChatStore(db), requests = new RequestStore(db);
  const session = catalog ? new DemoSession(db, checks) : new LiveSession(db, checks);
  const segments = new SegmentStore(db);
  registerTranscriptRoutes(app, segments, session);
  registerLibraryRoutes(app, segments, session, !catalog);
  app.get('/api/checks', async () => ({ checks: checks.store.list().map((job) => checkViewSchema.parse(job)) }));
  app.post('/api/checks', async (request, reply) => {
    const parsed = createCheckSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Choose a message or enter a claim of up to 1,000 characters.' });
    const value = parsed.data;
    const selectedIds = [...new Set(value.message_ids ?? (value.message_id ? [value.message_id] : []))];
    const observed = session.messages(db);
    const selected = selectedIds.flatMap((id) => { const message = chat.get(id) ?? observed.find((item) => item.id === id); return message ? [message] : []; })
      .sort((left, right) => left.created_at.localeCompare(right.created_at));
    if (selected.length !== selectedIds.length || selected.some((message) => !message.body || message.removed_reason)) return reply.code(404).send({ error: 'A selected message is no longer available.' });
    const existing = selected[0], claim = value.claim ?? selected.map((message) => message.body).join(' ');
    if (!claim.trim() || claim.length > 1000) return reply.code(400).send({ error: 'Keep the combined claim within 1,000 characters.' });
    try { assertNoSecretFragments(claim, loadedSecrets()); }
    catch { return reply.code(400).send({ error: 'This text contains a protected credential fragment.' }); }
    const id = randomUUID(), now = new Date().toISOString();
    for (const message of selected) if (!chat.get(message.id)) chat.put({ ...message, scope: 'check' });
    const source = existing ?? chat.put({ id: `dashboard-${id}`, broadcast_id: session.currentStreamId() ?? 'local', user_id: 'dashboard',
      user_login: 'dashboard', display_name: 'Dashboard', body: claim, badges: [], parent_id: null, created_at: now, scope: 'check', removed_reason: null });
    if (!source?.body) return reply.code(409).send({ error: 'The source was removed.' });
    const context = new SettingsStore(db).get().history_enabled ? chat.recent(source.user_id, source.created_at, selected.length ? selected.map((message) => message.id) : [source.id]) : [];
    const queued = requests.put({ id, kind: value.kind, body: claim, broadcast_id: session.currentStreamId() ?? source.broadcast_id, author_user_id: source.user_id,
      original_message_id: source.id, command_message_id: `dashboard-${id}`, context_ids: context.map((message) => message.id), source_message_ids: selected.length ? selected.map((message) => message.id) : [source.id],
      created_at: now, state: 'queued', source: 'dashboard' });
    return reply.code(202).send(checks.enqueue(queued, session.channelContext()));
  });
  app.post('/api/checks/:id/dismiss', async (request, reply) => {
    const params = checkIdParamsSchema.safeParse(request.params);
    if (!params.success || !checks.store.get(params.data.id)) return reply.code(404).send({ error: 'Check not found.' });
    checks.dismiss(params.data.id);
    return { dismissed: true };
  });
  app.post('/api/checks/:id/clip', async (request, reply) => {
    const params = checkIdParamsSchema.safeParse(request.params), approval = clipApprovalSchema.safeParse(request.body);
    if (!params.success || !approval.success) return reply.code(400).send({ error: 'Confirm clip creation for this stored moment.' });
    const job = checks.store.get(params.data.id), helix = session.twitch(), outcome = job?.outcome;
    if (!job || !['ready', 'on_air'].includes(job.state) || outcome?.type !== 'vod' || !outcome.found || outcome.failed || !outcome.vod_id || outcome.offset_s === null)
      return reply.code(409).send({ error: 'A reviewed VOD result with an archive is required.' });
    if (!helix) return reply.code(409).send({ error: 'Connect Twitch before creating a clip.' });
    const reserved = db.prepare('INSERT OR IGNORE INTO clip_attempts VALUES(?,?)').run(job.id, new Date().toISOString());
    if (!reserved.changes) return { started: false, clip: outcome.clip };
    const abort = new AbortController();
    const done = createVodClip(helix, outcome, { signal: abort.signal, onUpdate: (value) => checks.store.setClip(job.id, value) })
      .then(() => undefined).catch(() => {
        checks.store.setClip(job.id, { state: 'fallback', clip_id: null, clip_url: null, vod_url: vodTimestampUrl(outcome.vod_id!, outcome.offset_s!), reason: 'clip_unavailable' });
      }).finally(() => { clips.delete(job.id); });
    clips.set(job.id, { abort, done });
    return reply.code(202).send({ started: true });
  });
  app.get('/api/twitch/status', async () => session.status());
  app.post('/api/twitch/connect', async (_request, reply) => {
    try { await session.connect(); return session.status(); }
    catch { return reply.code(409).send({ error: 'Reconnect Twitch with npm run setup:twitch.' }); }
  });
  app.post('/api/twitch/disconnect', async () => { session.disconnect(); return session.status(); });
  app.addHook('onClose', async () => {
    session.disconnect(); await checks.close();
    for (const task of clips.values()) task.abort.abort();
    await Promise.all([...clips.values()].map((task) => task.done));
  });
  return { service: checks, session, segments, catalog, settings: (value: ChatSettings) => session.configure(value), removed: (ids: string[]) => checks.cancel(ids) };
}

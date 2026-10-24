import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { CheckService } from '../check/service.js';
import { checkIdParamsSchema, createCheckSchema, type ChatSettings } from '../shared/schemas.js';
import { assertNoSecretFragments } from '../shared/format-chat.js';
import { loadedSecrets } from '../shared/secrets.js';
import { ChatStore } from '../store/chat-store.js';
import { RequestStore } from '../store/request-store.js';
import { LiveSession } from './live-session.js';

export function registerCheckRoutes(app: FastifyInstance, db: DatabaseSync): {
  settings: (value: ChatSettings) => void; removed: (ids: string[]) => void
} {
  const checks = new CheckService(db), chat = new ChatStore(db), requests = new RequestStore(db);
  const session = new LiveSession(db, checks);
  app.get('/api/checks', async () => ({ checks: checks.store.list() }));
  app.post('/api/checks', async (request, reply) => {
    const parsed = createCheckSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Choose a message or enter a claim of up to 1,000 characters.' });
    const value = parsed.data, existing = value.message_id ? chat.get(value.message_id) : undefined;
    if (value.message_id && (!existing?.body || existing.removed_reason)) return reply.code(404).send({ error: 'This chat message is no longer available.' });
    const claim = value.claim ?? existing?.body ?? '';
    try { assertNoSecretFragments(claim, loadedSecrets()); }
    catch { return reply.code(400).send({ error: 'This text contains a protected credential fragment.' }); }
    const id = randomUUID(), now = new Date().toISOString();
    const source = existing ?? chat.put({ id: `dashboard-${id}`, broadcast_id: session.currentStreamId() ?? 'local', user_id: 'dashboard',
      user_login: 'dashboard', display_name: 'Dashboard', body: claim, badges: [], parent_id: null, created_at: now, scope: 'check', removed_reason: null });
    if (!source?.body) return reply.code(409).send({ error: 'The source was removed.' });
    const queued = requests.put({ id, kind: value.kind, body: claim, broadcast_id: source.broadcast_id, author_user_id: source.user_id,
      original_message_id: source.id, command_message_id: `dashboard-${id}`, context_ids: [], source_message_ids: [source.id],
      created_at: now, state: 'queued', source: 'dashboard' });
    return reply.code(202).send(checks.enqueue(queued, session.channelContext()));
  });
  app.post('/api/checks/:id/dismiss', async (request, reply) => {
    const params = checkIdParamsSchema.safeParse(request.params);
    if (!params.success || !checks.store.get(params.data.id)) return reply.code(404).send({ error: 'Check not found.' });
    checks.dismiss(params.data.id);
    return { dismissed: true };
  });
  app.get('/api/twitch/status', async () => session.status());
  app.post('/api/twitch/connect', async (_request, reply) => {
    try { await session.connect(); return session.status(); }
    catch { return reply.code(409).send({ error: 'Reconnect Twitch with npm run setup:twitch.' }); }
  });
  app.post('/api/twitch/disconnect', async () => { session.disconnect(); return session.status(); });
  app.addHook('onClose', async () => { session.disconnect(); await checks.close(); });
  return { settings: (value) => session.configure(value), removed: (ids) => checks.cancel(ids) };
}

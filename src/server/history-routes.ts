import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { ChatStore } from '../store/chat-store.js';
import { RequestStore } from '../store/request-store.js';
import { SettingsStore } from '../store/settings-store.js';
import { chatSettingsPatchSchema, chatSettingsSchema, historyPurgeSchema, historyQuerySchema, type ChatSettings } from '../shared/schemas.js';

export function registerHistoryRoutes(app: FastifyInstance, db: DatabaseSync, handlers: {
  onSettings?: (settings: ChatSettings) => void; onRemoved?: (requestIds: string[]) => void
} = {}): void {
  const chat = new ChatStore(db), requests = new RequestStore(db), settings = new SettingsStore(db);
  app.get('/api/settings', async () => settings.get());
  app.patch('/api/settings', async (request, reply) => {
    const patch = chatSettingsPatchSchema.safeParse(request.body);
    if (!patch.success) return reply.code(400).send({ error: 'Check the chat settings.' });
    const parsed = chatSettingsSchema.safeParse({ ...settings.get(), ...patch.data });
    if (!parsed.success) return reply.code(400).send({ error: 'Check the chat settings.' });
    const saved = settings.set(parsed.data);
    chat.purge(saved.retention_days); handlers.onSettings?.(saved);
    return saved;
  });
  app.get('/api/history', async (request, reply) => {
    const query = historyQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Check the history filters.' });
    return { messages: chat.list(query.data.user, query.data.stream, query.data.q, query.data.limit) };
  });
  app.get('/api/requests', async () => ({ requests: requests.list() }));
  app.post('/api/history/purge', async (request, reply) => {
    const body = historyPurgeSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Choose a viewer to remove.' });
    const removed = chat.clearUser(body.data.user_id, 'manual-purge', new Date().toISOString(), 'user_request');
    handlers.onRemoved?.(removed);
    return { removed: true };
  });
  const purge = () => chat.purge(settings.get().retention_days);
  app.addHook('onReady', async () => purge());
  const timer = setInterval(purge, 86_400_000); timer.unref();
  app.addHook('onClose', async () => clearInterval(timer));
}

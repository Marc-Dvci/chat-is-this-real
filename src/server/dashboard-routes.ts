import { randomUUID } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance } from 'fastify';
import { checkIdParamsSchema, checkViewSchema, companionHeartbeatSchema, demoVoteSchema, deskSnapshotSchema, historyContextSchema, modelUsageSchema, overlayViewSchema, postCheckSchema, presentationActionSchema, type ChatSettings, type ModelUsage } from '../shared/schemas.js';
import { SettingsStore } from '../store/settings-store.js';
import { ChatStore } from '../store/chat-store.js';
import { RequestStore } from '../store/request-store.js';
import { publicText } from './public-result.js';
import { PresentationControl } from './presentation-control.js';
import { registerEventStream } from './event-stream.js';
import { seedDemo } from '../demo/seed.js';
import type { registerCheckRoutes } from './check-routes.js';
import { formatChat } from '../shared/format-chat.js';
import { buildNotFoundReply, buildVodReply } from '../shared/reply-text.js';
import { vodTimestampUrl } from '../vod/clips.js';

export function registerDashboardRoutes(app: FastifyInstance, db: DatabaseSync, control: ReturnType<typeof registerCheckRoutes>) {
  const settings = new SettingsStore(db), chat = new ChatStore(db), requests = new RequestStore(db);
  const presenter = new PresentationControl(db, control), { presentation, results } = presenter;
  const demo = Boolean(control.catalog);
  let usageVersion = '', usage: ModelUsage[] = [];
  const removed = () => presenter.removed();
  const overlay = () => {
    removed(); const current = presentation.get();
    const job = current.job_id ? control.service.store.get(current.job_id) : undefined;
    let result = null;
    try { if (job && ['reveal', 'dwell', 'exit'].includes(current.phase)) result = results.project(job); }
    catch { presenter.hide(); }
    const scores = presenter.votes.scores(control.session.currentStreamId() ?? '');
    return overlayViewSchema.parse({ demo, enabled: settings.get().overlay_enabled, presentation: presentation.get(),
      result, position: settings.get().overlay_position, motion: settings.get().motion_enabled,
      votes: current.job_id ? presenter.votes.view(current.job_id) : null, waiting_for_review: presenter.waitingForReview(),
      leaders: settings.get().leaderboard_enabled ? scores.slice(0, 5).map((score, index) => ({ rank: index + 1, points: score.points })) : [] });
  };
  const snapshot = () => {
    let calls = control.catalog?.cases.flatMap((item) => item.outcome.calls) ?? [];
    if (!demo) {
      try {
        const stat = statSync('data/llm/usage.jsonl'), version = `${stat.mtimeMs}:${stat.size}`;
        if (version !== usageVersion) {
          usage = readFileSync('data/llm/usage.jsonl', 'utf8').trim().split('\n').flatMap((line) => {
            try { const result = modelUsageSchema.safeParse(JSON.parse(line)); return result.success ? [result.data] : []; } catch { return []; }
          }); usageVersion = version;
        }
        calls = usage;
      } catch { calls = []; }
    }
    const today = new Date().toISOString().slice(0, 10), selected = demo ? calls : calls.filter((call) => call.created_at.startsWith(today));
    const indexed = control.segments.broadcasts().map((broadcast) => control.segments.coverage(broadcast.id));
    const row = db.prepare("SELECT value_json FROM settings WHERE key='companion_heartbeat'").get();
    const heartbeat = row ? companionHeartbeatSchema.safeParse(JSON.parse(String(row.value_json))) : undefined;
    const at = heartbeat?.success && heartbeat.data.broadcast_id === control.session.currentStreamId() ? heartbeat.data.captured_at : null;
    const messages = control.session.messages(db);
    return deskSnapshotSchema.parse({ demo, messages, checks: control.service.store.list().map((job) => checkViewSchema.parse(job)),
      requests: requests.list(), settings: settings.get(), overlay: overlay(), twitch: control.session.status(),
      companion: { state: demo ? 'recorded' : !at ? 'waiting' : Date.now() - Date.parse(at) > 45_000 ? 'stale' : 'current', last_chunk_at: at },
      scores: presenter.votes.scores(control.session.currentStreamId() ?? '').map((score) => ({ ...score, display_name: messages.find((message) => message.user_id === score.user_id)?.display_name ?? 'Viewer' })),
      models: { recorded: demo, calls: selected.length, search_calls: selected.reduce((sum, call) => sum + call.search_calls, 0), last: selected.at(-1) ?? null },
      indexed_s: indexed.reduce((sum, item) => sum + item.end_s - item.start_s - item.gaps.reduce((gaps, gap) => gaps + gap.end_s - gap.start_s, 0), 0),
      samples: control.catalog?.cases.map(({ key, kind, text }) => ({ key, kind, text })) ?? [] });
  };
  app.get('/api/desk', async () => snapshot());
  app.get('/api/overlay', async () => overlay());
  registerEventStream(app, '/api/desk/events', snapshot);
  registerEventStream(app, '/api/overlay/events', overlay);
  app.post('/api/demo/reset', async (_request, reply) => {
    if (!control.catalog) return reply.code(404).send({ error: 'This action belongs to the recorded demo.' });
    presenter.hide(); await control.service.resetReplay();
    db.exec('DELETE FROM check_jobs; DELETE FROM requests; DELETE FROM messages; DELETE FROM moderation_watermarks; DELETE FROM broadcasts; DELETE FROM media_imports; DELETE FROM settings;');
    seedDemo(db, control.catalog); presenter.hide(); await control.session.connect();
    return snapshot();
  });
  app.post('/api/demo/vote', async (request, reply) => {
    const vote = demoVoteSchema.safeParse(request.body);
    if (!demo || !vote.success) return reply.code(404).send({ error: 'This action belongs to the scripted demo.' });
    const user = chat.list(vote.data.user, 'demo-stream')[0];
    if (!user) return reply.code(409).send({ error: 'That demo viewer is not available.' });
    const message = { ...user, id: `demo-vote-${randomUUID()}`, body: vote.data.text, created_at: new Date().toISOString(), parent_id: null, removed_reason: null };
    chat.put(message); return { accepted: presenter.observe(message), simulated: true };
  });
  app.get('/api/results/:id', async (request, reply) => {
    const params = checkIdParamsSchema.safeParse(request.params), job = params.success ? control.service.store.get(params.data.id) : undefined;
    if (!job) return reply.code(404).send({ error: 'Result not found.' });
    try { return results.project(job); } catch { return reply.code(409).send({ error: 'The stored result cannot be verified.' }); }
  });
  app.get('/api/history/context', async (request, reply) => {
    const query = historyContextSchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Choose a stored message.' });
    return { messages: chat.context(query.data.id) };
  });
  app.post('/api/presentation', async (request, reply) => {
    const action = presentationActionSchema.safeParse(request.body);
    if (!action.success) return reply.code(400).send({ error: 'Choose a presentation action.' });
    try {
      if (action.data.action === 'hide') presenter.hide();
      else if (action.data.action === 'show_check') {
        const job = control.service.store.get(action.data.id); if (!job) return reply.code(404).send({ error: 'Check not found.' });
        presenter.show(job, action.data.sensitive_confirmed);
      } else {
        const observed = control.session.messages(db);
        const selected = action.data.message_ids.flatMap((id) => { const value = chat.get(id) ?? observed.find((message) => message.id === id); return value ? [value] : []; })
          .sort((left, right) => left.created_at.localeCompare(right.created_at));
        if (selected.length !== action.data.message_ids.length || selected.some((message) => !message.body || message.removed_reason)) throw new Error('A selected message was removed.');
        const text = publicText(selected.map((message) => message.body).join(' ')); if (text.length > 1000) throw new Error('Keep the selected message within 1,000 characters.');
        for (const message of selected) if (!chat.get(message.id)) chat.put({ ...message, scope: 'check' });
        presenter.hide(); settings.set({ ...settings.get(), overlay_enabled: true });
        presentation.show({ phase: 'message', job_id: null, message_text: text, source_ids: selected.map((message) => message.id) }, settings.get().dwell_s);
      }
      return overlay();
    } catch (error) { return reply.code(409).send({ error: error instanceof Error ? error.message : 'The presentation was blocked.' }); }
  });
  app.post('/api/checks/:id/post', async (request, reply) => {
    const params = checkIdParamsSchema.safeParse(request.params), job = params.success ? control.service.store.get(params.data.id) : undefined;
    if (!job) return reply.code(404).send({ error: 'Check not found.' });
    const approval = postCheckSchema.safeParse(request.body ?? {});
    if (!approval.success || !['ready', 'on_air'].includes(job.state)) return reply.code(409).send({ error: 'Choose a completed check.' });
    if (job.outcome?.type === 'fact' && job.outcome.sensitive && !approval.data.sensitive_confirmed) return reply.code(409).send({ error: 'Confirm the sensitive claim before posting it.' });
    try {
      const result = results.project(job);
      if (demo) {
        const text = result.type === 'vod' && result.found && result.offset_s !== null && result.clip?.clip_url
          ? buildVodReply(result.offset_s, result.quote, result.clip.clip_url)
          : `${result.type === 'fact' ? result.verdict.toUpperCase().replaceAll('_', ' ') : 'NOT FOUND'}: ${result.type === 'fact' ? result.explanation : 'Not found in the recorded transcript.'} Details: http://${request.headers.host}/r/${job.id}`;
        chat.put({ id: `demo-reply-${randomUUID()}`, broadcast_id: 'demo-stream', user_id: 'demo-bot', user_login: 'demo_bot', display_name: 'demo_bot', body: formatChat(text), badges: [], parent_id: null, created_at: new Date().toISOString(), scope: 'history', removed_reason: null });
        return { posted: true, simulated: true };
      }
      if (result.type !== 'vod') return reply.code(409).send({ error: 'Connect public result pages before posting fact checks.' });
      const text = result.found && result.offset_s !== null && result.vod_id ? buildVodReply(result.offset_s, result.quote, result.clip?.clip_url ?? vodTimestampUrl(result.vod_id, result.offset_s))
        : buildNotFoundReply(result.coverage[0]?.start_s ?? 0, result.coverage[0]?.end_s ?? 0);
      if (!await control.session.postStored(job.id, text)) return reply.code(409).send({ error: 'Twitch did not accept the reply. Check the current stream.' });
      return { posted: true, simulated: false };
    } catch { return reply.code(409).send({ error: 'The reply was blocked. Check the stored evidence and stream.' }); }
  });
  app.addHook('onClose', async () => presenter.close());
  return { removed, purge: (userId: string) => presenter.purge(userId), settings: (value: ChatSettings) => presenter.configure(value) };
}

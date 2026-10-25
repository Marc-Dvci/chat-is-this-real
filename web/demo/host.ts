import { CheckQueue } from '../../src/check/queue.js';
import { demoReplay } from '../../src/demo/runner.js';
import { seedDemo } from '../../src/demo/seed.js';
import { PresentationControl } from '../../src/server/presentation-control.js';
import { PublicResults, publicText } from '../../src/server/public-result.js';
import { ChatStore } from '../../src/store/chat-store.js';
import { RequestStore } from '../../src/store/request-store.js';
import { SettingsStore } from '../../src/store/settings-store.js';
import { SegmentStore } from '../../src/store/segment-store.js';
import { transaction, type SqliteStore } from '../../src/store/sqlite.js';
import { formatChat } from '../../src/shared/format-chat.js';
import { buildNotFoundReply, buildVodReply } from '../../src/shared/reply-text.js';
import { vodTimestampUrl } from '../../src/shared/vod-links.js';
import { parseSubtitles } from '../../src/vod/subtitles.js';
import { chatSettingsPatchSchema, chatSettingsSchema, checkViewSchema, createCheckSchema, demoVoteSchema, deskSnapshotSchema,
  historyPurgeSchema, historyQuerySchema, overlayViewSchema, postCheckSchema, presentationActionSchema, subtitleUploadSchema,
  twitchVideosSchema, type DemoCatalog, type StoredMessage } from '../../src/shared/schemas.js';

export class DemoHost {
  readonly service: CheckQueue;
  readonly segments: SegmentStore;
  private presenter: PresentationControl;
  private readonly chat: ChatStore;
  private readonly requests: RequestStore;
  private readonly settings: SettingsStore;
  private readonly results: PublicResults;
  private connected = true;
  private readonly videos;
  constructor(private readonly db: SqliteStore, readonly catalog: DemoCatalog, videos: unknown, private readonly origin: string) {
    this.videos = twitchVideosSchema.parse(videos).data;
    this.chat = new ChatStore(db); this.requests = new RequestStore(db); this.settings = new SettingsStore(db); this.segments = new SegmentStore(db);
    this.service = new CheckQueue(db, () => undefined, demoReplay(catalog), true);
    seedDemo(db, catalog); this.results = new PublicResults(db); this.presenter = this.present();
  }
  private present() { return new PresentationControl(this.db, { service: this.service, session: {
    currentStreamId: () => this.connected ? 'demo-stream' : undefined, onMessage: () => undefined, onRemoval: () => undefined
  } }); }
  overlay() {
    this.presenter.removed(); const presentation = this.presenter.presentation.get(), settings = this.settings.get();
    const job = presentation.job_id ? this.service.store.get(presentation.job_id) : undefined;
    let result = null;
    try { if (job && ['reveal', 'dwell', 'exit'].includes(presentation.phase)) result = this.results.project(job); } catch { this.presenter.hide(); }
    return overlayViewSchema.parse({ demo: true, enabled: settings.overlay_enabled, presentation: this.presenter.presentation.get(), result,
      position: settings.overlay_position, motion: settings.motion_enabled, votes: presentation.job_id ? this.presenter.votes.view(presentation.job_id) : null,
      waiting_for_review: this.presenter.waitingForReview(), leaders: settings.leaderboard_enabled ? this.presenter.votes.scores('demo-stream').slice(0, 5).map((score, index) => ({ rank: index + 1, points: score.points })) : [] });
  }
  snapshot() {
    const calls = this.catalog.cases.flatMap((item) => item.outcome.calls), messages = this.chat.list(undefined, 'demo-stream');
    return deskSnapshotSchema.parse({ demo: true, messages, checks: this.service.store.list().map((job) => checkViewSchema.parse(job)),
      requests: this.requests.list(), settings: this.settings.get(), overlay: this.overlay(),
      twitch: { connected: this.connected, notice: this.connected ? 'demo_connected' : 'demo_paused', live_stream_id: this.connected ? 'demo-stream' : null },
      companion: { state: 'recorded', last_chunk_at: null }, indexed_s: this.segments.broadcasts().reduce((sum, item) => { const coverage = this.segments.coverage(item.id); return sum + coverage.end_s - coverage.start_s; }, 0),
      models: { recorded: true, calls: calls.length, search_calls: calls.reduce((sum, call) => sum + call.search_calls, 0), last: calls.at(-1) ?? null },
      scores: this.presenter.votes.scores('demo-stream').map((score) => ({ ...score, display_name: messages.find((message) => message.user_id === score.user_id)?.display_name ?? 'Viewer' })),
      samples: this.catalog.cases.map(({ key, kind, text }) => ({ key, kind, text })) });
  }
  async request(path: string, method: 'GET' | 'POST' | 'PATCH', body: unknown): Promise<unknown> {
    const url = new URL(path, this.origin), query = Object.fromEntries(url.searchParams);
    if (url.origin !== this.origin || !url.pathname.startsWith('/api/')) throw new Error('Choose a recorded demo action.');
    path = url.pathname;
    if (method === 'GET') {
      if (path === '/api/session') return { csrf_token: '0'.repeat(64) };
      if (path === '/api/desk') return this.snapshot();
      if (path === '/api/overlay') return this.overlay();
      if (path === '/api/settings') return this.settings.get();
      if (path === '/api/requests') return { requests: this.requests.list() };
      if (path === '/api/checks') return { checks: this.service.store.list().map((job) => checkViewSchema.parse(job)) };
      if (path === '/api/history') { const value = historyQuerySchema.parse(query); return { messages: this.chat.list(value.user, value.stream, value.q, value.limit) }; }
      if (path === '/api/history/context') return { messages: this.chat.context(query.id ?? '') };
      if (path.startsWith('/api/results/')) { const job = this.service.store.get(path.slice('/api/results/'.length)); if (!job) throw new Error('Result not found.'); return this.results.project(job); }
      if (path === '/api/library') return { broadcasts: this.segments.broadcasts().map((item) => ({ ...item, coverage: this.segments.coverage(item.id) })) };
      if (path === '/api/library/vods') return { videos: this.videos };
      if (path === '/api/library/imports') return { imports: [] };
      if (path === '/api/library/segments') return { segments: query.broadcast_id ? query.q?.trim() ? this.segments.search(query.broadcast_id, query.q) : this.segments.all(query.broadcast_id).slice(0, 200) : [] };
    }
    if (method === 'PATCH' && path === '/api/settings') { const value = chatSettingsSchema.parse({ ...this.settings.get(), ...chatSettingsPatchSchema.parse(body) }); this.settings.set(value); this.presenter.configure(value); return value; }
    if (method !== 'POST') throw new Error('This demo action is unavailable.');
    if (path === '/api/twitch/connect' || path === '/api/twitch/disconnect') { this.connected = path.endsWith('/connect'); return this.snapshot().twitch; }
    if (path === '/api/demo/reset') {
      this.presenter.close(); await this.service.resetReplay();
      this.db.exec('DELETE FROM check_jobs; DELETE FROM requests; DELETE FROM messages; DELETE FROM moderation_watermarks; DELETE FROM broadcasts; DELETE FROM settings;');
      seedDemo(this.db, this.catalog); this.connected = true; this.presenter = this.present(); return this.snapshot();
    }
    if (path === '/api/checks') return this.enqueue(body);
    if (path === '/api/history/purge') {
      const value = historyPurgeSchema.parse(body), user = value.user_id ?? this.chat.list().find((message) => message.user_login.toLowerCase() === value.user_login?.toLowerCase())?.user_id;
      if (!user) throw new Error('No stored messages were found for that viewer.');
      const removed = this.chat.clearUser(user, 'manual-purge', new Date().toISOString(), 'user_request'); this.service.cancel(removed); this.presenter.purge(user); this.presenter.removed(); return { removed: true };
    }
    if (path === '/api/presentation') {
      const action = presentationActionSchema.parse(body);
      if (action.action === 'hide') { this.presenter.hide(); this.settings.set({ ...this.settings.get(), leaderboard_enabled: false }); }
      else if (action.action === 'show_check') { const job = this.service.store.get(action.id); if (!job) throw new Error('Check not found.'); this.presenter.show(job, action.sensitive_confirmed); }
      else { const messages = action.message_ids.map((id) => this.chat.get(id)); if (messages.some((message) => !message?.body || message.removed_reason)) throw new Error('The source was removed.'); this.presenter.hide(); this.settings.set({ ...this.settings.get(), overlay_enabled: true }); this.presenter.presentation.show({ phase: 'message', job_id: null, message_text: publicText(messages.map((item) => item?.body).join(' ')), source_ids: action.message_ids }, this.settings.get().dwell_s); }
      return this.overlay();
    }
    if (path === '/api/demo/vote') {
      const vote = demoVoteSchema.parse(body), user = this.chat.list(vote.user, 'demo-stream')[0]; if (!user) throw new Error('That demo viewer is unavailable.');
      const message: StoredMessage = { ...user, id: `demo-vote-${crypto.randomUUID()}`, body: vote.text, created_at: new Date().toISOString(), parent_id: null, removed_reason: null };
      this.chat.put(message); return { accepted: this.presenter.observe(message), simulated: true };
    }
    if (path === '/api/library/subtitles') return this.importCaptions(body);
    const match = /^\/api\/checks\/([^/]+)\/(dismiss|post|publish)$/u.exec(path), job = match?.[1] ? this.service.store.get(match[1]) : undefined;
    if (job && match) {
      if (match[2] === 'dismiss') { this.service.dismiss(job.id); return { dismissed: true }; }
      if (!['ready', 'on_air'].includes(job.state)) throw new Error('Choose a completed check.');
      const approval = postCheckSchema.parse(body);
      if (job.outcome?.type === 'fact' && job.outcome.sensitive && !approval.sensitive_confirmed) throw new Error('Confirm the sensitive claim.');
      const result = this.results.project(job), link = `${this.origin}/demo/r/${job.id}`;
      if (match[2] === 'publish') return { url: link, simulated: true };
      const text = result.type === 'vod' ? result.found && result.offset_s !== null && result.vod_id ? buildVodReply(result.offset_s, result.quote, result.clip?.clip_url ?? vodTimestampUrl(result.vod_id, result.offset_s))
        : buildNotFoundReply(result.coverage[0]?.start_s ?? 0, result.coverage[0]?.end_s ?? 0) : formatChat(`${result.verdict.replaceAll('_', ' ').toUpperCase()}: ${result.explanation} Details: ${link}`);
      this.chat.put({ id: `demo-reply-${crypto.randomUUID()}`, broadcast_id: 'demo-stream', user_id: 'demo-bot', user_login: 'demo_bot', display_name: 'demo_bot', body: text, badges: [], parent_id: null, created_at: new Date().toISOString(), scope: 'history', removed_reason: null }); return { posted: true, simulated: true };
    }
    throw new Error('This action is available in the connected local app.');
  }
  private enqueue(body: unknown) {
    const value = createCheckSchema.parse(body), ids = [...new Set(value.message_ids ?? (value.message_id ? [value.message_id] : []))];
    const selected = ids.map((id) => this.chat.get(id)).sort((left, right) => (left?.created_at ?? '').localeCompare(right?.created_at ?? ''));
    if (selected.some((message) => !message?.body || message.removed_reason)) throw new Error('A selected message was removed.');
    const claim = value.claim ?? selected.map((message) => message?.body).join(' '); if (!claim.trim() || claim.length > 1000) throw new Error('Keep the claim within 1,000 characters.');
    const id = crypto.randomUUID(), now = new Date().toISOString(), first = selected[0] ?? this.chat.put({ id: `dashboard-${id}`, broadcast_id: 'demo-stream', user_id: 'dashboard', user_login: 'dashboard', display_name: 'Dashboard', body: claim, badges: [], parent_id: null, created_at: now, scope: 'check', removed_reason: null });
    if (!first?.body) throw new Error('The source was removed.');
    const context = this.settings.get().history_enabled ? this.chat.recent(first.user_id, first.created_at, ids.length ? ids : [first.id]) : [];
    const request = this.requests.put({ id, kind: value.kind, body: claim, broadcast_id: 'demo-stream', author_user_id: first.user_id, original_message_id: first.id,
      command_message_id: `dashboard-${id}`, context_ids: context.map((message) => message.id), source_message_ids: ids.length ? ids : [first.id], created_at: now, state: 'queued', source: 'dashboard' });
    return this.service.enqueue(request, { title: 'Recorded development stream', category: 'Just Chatting', language: 'en' });
  }
  private importCaptions(body: unknown) {
    const value = subtitleUploadSchema.parse(body), video = this.videos.find((item) => item.id === value.vod_id);
    if (!video) throw new Error('Choose a recorded past broadcast.');
    const cues = parseSubtitles(value.text, value.format), id = `upload-${video.id}`, now = new Date().toISOString();
    transaction(this.db, () => { this.segments.remove(id); this.segments.register({ id, vod_id: video.id, title: video.title, started_at: video.created_at, source: 'upload', created_at: now });
      cues.forEach((cue, index) => this.segments.put({ id: `${id}-cue-${index}`, broadcast_id: id, vod_id: video.id, offset_s: cue.start, duration_s: cue.end - cue.start, text: cue.text, words: [], source: 'upload', created_at: now })); });
    return { broadcast: this.segments.broadcast(id), coverage: this.segments.coverage(id) };
  }
}

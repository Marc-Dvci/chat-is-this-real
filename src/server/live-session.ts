import type { DatabaseSync } from 'node:sqlite';
import type { CheckService } from '../check/service.js';
import type { ChatSettings, CheckInput } from '../shared/schemas.js';
import { twitchChannelInfoSchema } from '../shared/schemas.js';
import { ChatStore } from '../store/chat-store.js';
import { RequestStore } from '../store/request-store.js';
import { SettingsStore } from '../store/settings-store.js';
import { ChatCore } from '../twitch/chat-core.js';
import { loadTwitchConfig } from '../twitch/config.js';
import { TwitchHelix } from '../twitch/helix.js';
import { TwitchPublisher } from '../twitch/publisher.js';
import { TwitchRuntime } from '../twitch/runtime.js';
import { TwitchTokens } from '../twitch/tokens.js';

export class LiveSession {
  private runtime: TwitchRuntime | undefined;
  private publisher: TwitchPublisher | undefined;
  private starting: Promise<void> | undefined;
  private generation = 0;
  private notice = 'twitch_disconnected';
  private channel: CheckInput['channel'] = { title: '', category: '', language: 'en' };
  constructor(private readonly db: DatabaseSync, private readonly checks: CheckService) {}

  status() { return { connected: this.runtime?.isConnected() ?? false, notice: this.notice, live_stream_id: this.runtime?.liveStreamId() ?? null }; }
  currentStreamId(): string | undefined { return this.runtime?.liveStreamId(); }
  channelContext(): CheckInput['channel'] { return this.channel; }
  configure(settings: ChatSettings): void { this.runtime?.core.configure(settings); }

  async connect(): Promise<void> {
    if (this.starting) return this.starting;
    if (this.runtime?.isStarted()) return;
    const generation = ++this.generation;
    this.notice = 'twitch_connecting';
    this.starting = this.start(generation).catch(() => {
      if (generation === this.generation) { this.runtime?.stop(); this.runtime = undefined; this.notice = 'twitch_reconnect_required'; }
      throw new Error('Reconnect Twitch with npm run setup:twitch.');
    }).finally(() => { this.starting = undefined; });
    return this.starting;
  }
  private async start(generation: number): Promise<void> {
    const tokens = await TwitchTokens.open(loadTwitchConfig());
    await tokens.validateAll();
    const [broadcaster, bot] = await Promise.all([tokens.get('broadcaster'), tokens.get('bot')]);
    if (!broadcaster.user_id || !bot.user_id) throw new Error('Reconnect Twitch.');
    const helix = new TwitchHelix(tokens);
    const info = await helix.request('app', 'GET', `/channels?${new URLSearchParams({ broadcaster_id: broadcaster.user_id })}`, twitchChannelInfoSchema);
    if (generation !== this.generation) return;
    const channel = info.data[0];
    this.channel = { title: channel?.title ?? '', category: channel?.game_name ?? '', language: channel?.broadcaster_language ?? 'en' };
    const requests = new RequestStore(this.db);
    const core = new ChatCore(new ChatStore(this.db), requests, broadcaster.user_id, bot.user_id, new SettingsStore(this.db).get(), {
      onRequest: (request) => {
        this.checks.enqueue(request, this.channel);
        void this.publisher?.acknowledge(request.id).catch(() => { this.notice = 'twitch_publication_failed'; });
      },
      onRemoved: (ids) => this.checks.cancel(ids), onNotice: (code) => { this.notice = code; }
    });
    const runtime = new TwitchRuntime(core, helix, (code) => { this.notice = code; });
    this.runtime = runtime;
    this.publisher = new TwitchPublisher(helix, requests, () => runtime.liveStreamId(), (code) => { this.notice = code; });
    await runtime.start();
    if (generation !== this.generation) runtime.stop();
  }
  disconnect(): void {
    this.generation++;
    this.runtime?.stop(); this.runtime = undefined; this.publisher = undefined;
    this.notice = 'twitch_disconnected';
  }
}

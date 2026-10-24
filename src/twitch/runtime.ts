import { eventSubCreatedSchema } from '../shared/schemas.js';
import type { ChatCore } from './chat-core.js';
import { EventSubWs } from './eventsub-ws.js';
import type { TwitchHelix } from './helix.js';

export class TwitchRuntime {
  private socket: EventSubWs | undefined;
  private validationTimer: ReturnType<typeof setInterval> | undefined;
  private connected = false;
  private generation = 0;
  constructor(readonly core: ChatCore, readonly helix: TwitchHelix,
    private readonly notice: (code: string) => void, private readonly raw?: (frame: string) => void) {}

  liveStreamId(): string | undefined { return this.connected ? this.core.currentStreamId() : undefined; }

  async start(): Promise<void> {
    if (this.socket) return;
    const generation = ++this.generation;
    await this.helix.tokens.validateAll();
    if (generation !== this.generation) return;
    const broadcaster = await this.helix.tokens.get('broadcaster');
    const bot = await this.helix.tokens.get('bot');
    if (generation !== this.generation) return;
    const socket = new EventSubWs({
      onSession: async (sessionId) => {
        const types = ['channel.chat.message', 'channel.chat.message_delete', 'channel.chat.clear_user_messages', 'channel.chat.clear', 'stream.online', 'stream.offline'];
        await Promise.all(types.map((type) => this.helix.request('bot', 'POST', '/eventsub/subscriptions', eventSubCreatedSchema, {
          type, version: '1', condition: { broadcaster_user_id: broadcaster.user_id,
            ...(type.startsWith('channel.chat.') ? { user_id: bot.user_id } : {}) }, transport: { method: 'websocket', session_id: sessionId }
        })));
        const stream = await this.helix.currentStream();
        if (generation !== this.generation) return;
        this.core.setStream(stream?.id);
        this.connected = true;
        this.notice('twitch_connected');
      },
      onNotification: async (frame) => {
        if (generation !== this.generation) return;
        const event = frame.payload.event;
        if (event && frame.payload.subscription?.type === 'stream.offline' && event.broadcaster_user_id === broadcaster.user_id) {
          this.core.setStream(undefined);
        } else if (event && frame.payload.subscription?.type === 'stream.online' && event.broadcaster_user_id === broadcaster.user_id) {
          const stream = await this.helix.currentStream();
          if (generation === this.generation && stream && stream.id === event.id) this.core.setStream(stream.id);
        } else this.core.handle(frame);
      },
      onError: (_error, terminal) => {
        this.connected = false; this.core.setStream(undefined);
        this.notice(terminal ? 'twitch_reconnect_required' : 'twitch_reconnecting');
        if (terminal) this.stop();
      },
      ...(this.raw ? { onRawFrame: this.raw } : {})
    });
    this.socket = socket;
    socket.connect();
    this.validationTimer = setInterval(() => {
      void this.helix.tokens.validateAll().catch(() => { this.notice('twitch_reconnect_required'); this.stop(); });
    }, 60 * 60_000);
    this.validationTimer.unref();
  }

  stop(): void {
    this.generation++;
    clearInterval(this.validationTimer);
    this.validationTimer = undefined;
    this.socket?.close(); this.socket = undefined;
    this.connected = false; this.core.setStream(undefined);
  }
}

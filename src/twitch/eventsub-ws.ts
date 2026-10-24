import { eventSubEnvelopeSchema, type EventSubEnvelope } from '../shared/schemas.js';

type EventSubHandlers = {
  onSession: (sessionId: string) => Promise<void>;
  onNotification: (frame: EventSubEnvelope) => Promise<void> | void;
  onRawFrame?: (raw: string) => void;
  onError: (error: Error, terminal: boolean) => void;
};

const endpoint = 'wss://eventsub.wss.twitch.tv/ws';

export class EventSubWs {
  private active: WebSocket | undefined;
  private replacement: WebSocket | undefined;
  private heartbeat: ReturnType<typeof setTimeout> | undefined;
  private handshake: ReturnType<typeof setTimeout> | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly seen = new Map<string, number>();
  private closed = false;
  private keepalive = 15_000;
  private retries = 0;

  constructor(private readonly handlers: EventSubHandlers) {}

  connect(): void {
    if (this.closed || this.active) return;
    this.active = this.open(endpoint);
  }

  private open(url: string): WebSocket {
    const parsed = new URL(url);
    if (parsed.protocol !== 'wss:' || parsed.hostname !== 'eventsub.wss.twitch.tv' || parsed.port || parsed.username || parsed.password) {
      throw new Error('Twitch supplied an invalid EventSub reconnect address.');
    }
    // Node's WebSocket implementation answers protocol Ping frames with Pong.
    const socket = new WebSocket(url);
    this.handshake = setTimeout(() => this.reconnect('EventSub welcome timed out.'), 10_000);
    socket.onmessage = (event: MessageEvent<unknown>) => {
      if (typeof event.data !== 'string') {
        this.reconnect('EventSub sent an unsupported frame.');
        return;
      }
      void this.receive(event.data, socket).catch(() => this.reconnect('EventSub processing failed.'));
    };
    socket.onerror = () => {
      if (socket === this.active || socket === this.replacement) this.reconnect('EventSub connection failed.');
    };
    socket.onclose = () => {
      if (!this.closed && (socket === this.active || socket === this.replacement)) {
        this.reconnect('EventSub disconnected.');
      }
    };
    return socket;
  }

  async receive(raw: string, socket = this.active): Promise<void> {
    if (this.closed || (socket && socket !== this.active && socket !== this.replacement)) return;
    if (Buffer.byteLength(raw) > 256 * 1024) throw new Error('EventSub frame exceeded the capture limit.');
    const frame = eventSubEnvelopeSchema.parse(JSON.parse(raw));
    this.handlers.onRawFrame?.(raw);
    const { message_type: type, message_id: id } = frame.metadata;
    if (type === 'session_keepalive' || type === 'notification') this.resetHeartbeat();
    const now = Date.now();
    for (const [seenId, received] of this.seen) {
      if (now - received > 60 * 60_000 || this.seen.size > 10_000) this.seen.delete(seenId);
      else break;
    }
    if (this.seen.has(id)) return;
    this.seen.set(id, now);

    if (type === 'session_welcome') {
      clearTimeout(this.handshake);
      const session = frame.payload.session;
      if (!session) throw new Error('EventSub welcome has no session.');
      this.keepalive = ((session.keepalive_timeout_seconds ?? 10) + 5) * 1000;
      const migrated = !!this.replacement && socket === this.replacement;
      if (migrated) {
        const previous = this.active;
        this.active = this.replacement;
        this.replacement = undefined;
        previous?.close();
      }
      this.retries = 0;
      this.resetHeartbeat();
      if (!migrated) await this.handlers.onSession(session.id);
      return;
    }

    if (type === 'session_reconnect') {
      const url = frame.payload.session?.reconnect_url;
      if (!url || this.replacement) return;
      this.replacement = this.open(url);
      return;
    }

    if (type === 'revocation') {
      this.close();
      this.handlers.onError(new Error('A Twitch subscription was revoked. Reconnect Twitch.'), true);
      return;
    }
    if (type === 'notification') await this.handlers.onNotification(frame);
  }

  private resetHeartbeat(): void {
    clearTimeout(this.heartbeat);
    this.heartbeat = setTimeout(() => this.reconnect('EventSub keepalive timed out.'), this.keepalive);
  }

  private reconnect(reason: string): void {
    if (this.closed || this.reconnectTimer) return;
    clearTimeout(this.heartbeat);
    clearTimeout(this.handshake);
    const previous = this.active;
    const replacement = this.replacement;
    this.active = undefined;
    this.replacement = undefined;
    previous?.close();
    replacement?.close();
    this.handlers.onError(new Error(reason), false);
    if (this.closed) return;
    const wait = Math.min(30_000, 1000 * 2 ** Math.min(this.retries++, 5));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, wait);
  }

  close(): void {
    this.closed = true;
    clearTimeout(this.heartbeat);
    clearTimeout(this.handshake);
    clearTimeout(this.reconnectTimer);
    this.active?.close();
    this.replacement?.close();
    this.active = undefined;
    this.replacement = undefined;
  }
}

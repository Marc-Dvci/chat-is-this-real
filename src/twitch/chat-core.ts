import { randomUUID } from 'node:crypto';
import { chatSettingsSchema, moderationEventSchema, twitchChatEventSchema, type ChatSettings, type CheckRequest, type EventSubEnvelope, type RemovalScope, type StoredMessage } from '../shared/schemas.js';
import type { ChatStore } from '../store/chat-store.js';
import type { RequestStore } from '../store/request-store.js';
import { CommandCooldown, commandPermission, parseChatCommand } from './commands.js';

type Handlers = {
  onRequest: (request: CheckRequest) => void;
  onMessage?: (message: StoredMessage) => void;
  onRemoved?: (cancelledRequests: string[], scope: RemovalScope) => void;
  onNotice?: (code: string) => void;
};

export class ChatCore {
  private streamId: string | undefined;
  private settings: ChatSettings;
  private readonly cooldowns = new CommandCooldown();
  constructor(readonly chat: ChatStore, readonly requests: RequestStore, private readonly broadcasterId: string,
    private readonly botId: string, settings: ChatSettings, private readonly handlers: Handlers, private readonly now = Date.now) {
    this.settings = chatSettingsSchema.parse(settings);
  }
  configure(settings: ChatSettings): void { this.settings = chatSettingsSchema.parse(settings); }
  setStream(id: string | undefined): void { this.streamId = id; }
  currentStreamId(): string | undefined { return this.streamId; }

  handle(frame: EventSubEnvelope): void {
    const type = frame.payload.subscription?.type ?? frame.metadata.subscription_type;
    const event = frame.payload.event;
    if (!event || event.broadcaster_user_id !== this.broadcasterId) return;
    const at = new Date(frame.metadata.message_timestamp).toISOString();
    if (type === 'channel.chat.message') { this.message(event, at); return; }
    const moderation = moderationEventSchema.safeParse(event);
    if (!moderation.success) return;
    let cancelled: string[];
    let scope: RemovalScope;
    if (type === 'channel.chat.message_delete' && moderation.data.message_id) {
      cancelled = this.chat.deleteMessage(moderation.data.message_id, this.streamId ?? 'offline', at);
      scope = { type: 'message', id: moderation.data.message_id };
    } else if (type === 'channel.chat.clear_user_messages' && moderation.data.target_user_id) {
      cancelled = this.chat.clearUser(moderation.data.target_user_id, this.streamId ?? 'offline', at);
      scope = { type: 'user', id: moderation.data.target_user_id };
    } else if (type === 'channel.chat.clear' && this.streamId) {
      cancelled = this.chat.clearStream(this.streamId, at); scope = { type: 'stream', id: this.streamId };
    }
    else return;
    this.handlers.onRemoved?.(cancelled, scope);
  }

  private message(raw: unknown, at: string): void {
    const parsed = twitchChatEventSchema.safeParse(raw);
    if (!parsed.success) { this.handlers.onNotice?.('invalid_chat_event'); return; }
    const event = parsed.data;
    if (event.source_broadcaster_user_id && event.source_broadcaster_user_id !== this.broadcasterId) return;
    if (!this.streamId) return;
    const value: StoredMessage = { id: event.message_id, broadcast_id: this.streamId, user_id: event.chatter_user_id,
      user_login: event.chatter_user_login, display_name: event.chatter_user_name, body: event.message.text,
      badges: event.badges, parent_id: event.reply?.parent_message_id ?? null, created_at: at, scope: 'history', removed_reason: null };
    if (this.chat.suppressed(value)) return;
    if (this.settings.history_enabled) this.chat.put(value);
    this.handlers.onMessage?.(value);
    if (event.chatter_user_id === this.botId || this.requests.byCommand(event.message_id)) return;
    const command = parseChatCommand(event.message.text, this.settings);
    if (!command) return;
    const permission = commandPermission(event.chatter_user_id, this.broadcasterId, event.badges, this.settings.permission);
    if (!permission.allowed) { this.handlers.onNotice?.('command_unauthorized'); return; }
    const now = this.now();
    if (!this.cooldowns.allows(event.chatter_user_id, permission.privileged, now)) { this.handlers.onNotice?.('command_cooldown'); return; }
    let source = this.chat.get(event.message_id);
    if (command.argument) source ??= this.chat.put({ ...value, scope: 'check' });
    else if (event.reply) {
      source = this.chat.get(event.reply.parent_message_id);
      source ??= this.chat.put({ id: event.reply.parent_message_id, broadcast_id: this.streamId, user_id: event.reply.parent_user_id,
        user_login: event.reply.parent_user_login, display_name: event.reply.parent_user_name, body: event.reply.parent_message_body,
        badges: [], parent_id: null, created_at: at, scope: 'check', removed_reason: null }, true);
    } else { this.handlers.onNotice?.('command_missing_text'); return; }
    if (!source?.body || source.removed_reason) { this.handlers.onNotice?.('source_unavailable'); return; }
    const body = command.argument || source.body;
    if (body.length > 1000) { this.handlers.onNotice?.('claim_too_long'); return; }
    const context = this.settings.history_enabled ? this.chat.recent(source.user_id, at, [source.id, event.message_id]) : [];
    const request = this.requests.put({ id: randomUUID(), kind: command.kind, body, broadcast_id: this.streamId,
      author_user_id: source.user_id, original_message_id: source.id, command_message_id: event.message_id,
      context_ids: context.map((message) => message.id), source_message_ids: [source.id], created_at: new Date(now).toISOString(), state: 'queued', source: 'chat' });
    this.cooldowns.consume(event.chatter_user_id, permission.privileged, now, this.settings.cooldown_s);
    this.handlers.onRequest(request);
  }
}

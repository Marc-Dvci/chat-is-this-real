import { formatChat } from '../shared/format-chat.js';
import { twitchChatSentSchema, twitchSharedChatSchema } from '../shared/schemas.js';
import type { RequestStore } from '../store/request-store.js';
import type { TwitchHelix } from './helix.js';
import { TwitchHttpError } from './tokens.js';

export class TwitchPublisher {
  constructor(readonly helix: TwitchHelix, readonly requests: RequestStore, private readonly liveStream: () => string | undefined,
    private readonly notice: (code: string) => void) {}

  async acknowledge(requestId: string): Promise<void> { await this.send(requestId, 'ack', 'Checking...'); }
  async reply(requestId: string, formattedText: string): Promise<void> { await this.send(requestId, 'result', formattedText); }

  private async send(requestId: string, kind: 'ack' | 'result', text: string): Promise<void> {
    const request = this.requests.get(requestId);
    if (!request || request.state === 'cancelled' || this.liveStream() !== request.broadcast_id) throw new Error('Publication requires the current broadcaster-started stream.');
    const safe = formatChat(text, this.helix.tokens.loadedSecrets());
    const reserved = this.requests.db.prepare("INSERT OR IGNORE INTO publications(request_id,kind,status) VALUES(?,?,'sending')").run(requestId, kind);
    if (!reserved.changes) return;
    try {
      const stream = await this.helix.requireStream(request.broadcast_id);
      const bot = await this.helix.tokens.get('bot');
      const body = { broadcaster_id: stream.user_id, sender_id: bot.user_id,
        reply_parent_message_id: request.original_message_id, message: safe };
      const send = async (role: 'app' | 'bot') => {
        await this.helix.requireStream(request.broadcast_id);
        if (this.liveStream() !== request.broadcast_id || this.requests.get(requestId)?.state === 'cancelled') throw new Error('Publication was cancelled.');
        return this.helix.request(role, 'POST', '/chat/messages', twitchChatSentSchema, { ...body, ...(role === 'app' ? { for_source_only: true } : {}) });
      };
      let response;
      try { response = await send('app'); }
      catch (error) {
        if (!(error instanceof TwitchHttpError && [401, 403].includes(error.status))) throw error;
        const shared = await this.helix.request('bot', 'GET', `/shared_chat/session?${new URLSearchParams({ broadcaster_id: stream.user_id })}`, twitchSharedChatSchema);
        if (shared.data.length) throw new Error('User-token fallback is disabled during Shared Chat.', { cause: error });
        response = await send('bot');
      }
      const sent = response.data[0];
      if (!sent?.is_sent) {
        const reason = sent?.drop_reason?.code ?? 'unknown';
        this.requests.db.prepare("UPDATE publications SET status='dropped',reason=? WHERE request_id=? AND kind=?").run(reason, requestId, kind);
        this.notice('twitch_message_dropped');
        return;
      }
      this.requests.db.prepare("UPDATE publications SET status='sent',message_id=? WHERE request_id=? AND kind=?").run(sent.message_id, requestId, kind);
    } catch {
      this.requests.db.prepare("UPDATE publications SET status='blocked',reason='send_failed' WHERE request_id=? AND kind=?").run(requestId, kind);
      this.notice('twitch_publication_failed');
    }
  }
}

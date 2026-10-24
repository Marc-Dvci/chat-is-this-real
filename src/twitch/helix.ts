import type { z } from 'zod';
import {
  twitchChatSentSchema, twitchClipCreatedSchema, twitchClipsSchema, twitchSharedChatSchema, twitchStreamsSchema, twitchVideosSchema,
  type TokenRole, type TwitchStream
} from '../shared/schemas.js';
import { formatChat } from '../shared/format-chat.js';
import { TwitchHttpError, type TwitchTokens } from './tokens.js';

export class TwitchHelix {
  constructor(readonly tokens: TwitchTokens, readonly signal?: AbortSignal) {}

  async request<T>(role: TokenRole, method: 'GET' | 'POST' | 'PATCH', path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
    if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid Twitch API path.');
    const url = `https://api.twitch.tv/helix${path}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.tokens.get(role, attempt === 1);
      const response = await fetch(url, {
        method, signal: this.signal ? AbortSignal.any([this.signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000), redirect: 'error',
        headers: {
          Authorization: `Bearer ${token.access_token}`, 'Client-Id': this.tokens.config.TWITCH_CLIENT_ID,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      if (response.status === 401 && attempt === 0) continue;
      if (!response.ok) throw new TwitchHttpError(response.status);
      const parsed = schema.safeParse(response.status === 204 ? null : await response.json());
      if (!parsed.success) throw new Error('Twitch returned an unexpected API response.');
      return parsed.data;
    }
    throw new Error('Reconnect Twitch.');
  }

  async currentStream(): Promise<TwitchStream | undefined> {
    const broadcaster = await this.tokens.get('broadcaster');
    const response = await this.request('app', 'GET', `/streams?${new URLSearchParams({ user_id: broadcaster.user_id ?? '' })}`, twitchStreamsSchema);
    return response.data.find((stream) => stream.user_id === broadcaster.user_id && stream.type === 'live');
  }

  async requireStream(expectedStreamId: string): Promise<TwitchStream> {
    const stream = await this.currentStream();
    if (!stream || stream.id !== expectedStreamId) throw new Error('The approved test stream is no longer live.');
    return stream;
  }

  async currentVod(stream: TwitchStream) {
    return this.vodForStream(stream.user_id, stream.id);
  }

  async vodForStream(broadcasterId: string, streamId: string) {
    const response = await this.request('app', 'GET', `/videos?${new URLSearchParams({ user_id: broadcasterId, type: 'archive', first: '100' })}`, twitchVideosSchema);
    return response.data.find((video) => video.stream_id === streamId && video.user_id === broadcasterId);
  }

  async sendProbeReply(stream: TwitchStream, parentId: string): Promise<void> {
    await this.requireStream(stream.id);
    const bot = await this.tokens.get('bot');
    const response = await this.request('app', 'POST', '/chat/messages', twitchChatSentSchema, {
      broadcaster_id: stream.user_id, sender_id: bot.user_id,
      reply_parent_message_id: parentId, for_source_only: true,
      message: formatChat('Twitch probe: threaded reply received.', this.tokens.loadedSecrets())
    });
    if (!response.data[0]?.is_sent) throw new Error(`Twitch dropped the test reply (${response.data[0]?.drop_reason?.code ?? 'unknown'}).`);
  }

  async sendScriptedTestMessage(stream: TwitchStream, role: 'bot' | 'broadcaster', text: string, parentId?: string): Promise<string> {
    await this.requireStream(stream.id);
    const sender = await this.tokens.get(role);
    if (role === 'broadcaster') {
      const shared = await this.request('app', 'GET', `/shared_chat/session?${new URLSearchParams({ broadcaster_id: stream.user_id })}`, twitchSharedChatSchema);
      if (shared.data.length) throw new Error('Keep scripted broadcaster messages out of Shared Chat sessions.');
      if (!sender.scopes.includes('user:write:chat')) throw new Error('Authorize automated test-chat permissions first.');
    }
    const response = await this.request(role === 'bot' ? 'app' : 'broadcaster', 'POST', '/chat/messages', twitchChatSentSchema, {
      broadcaster_id: stream.user_id, sender_id: sender.user_id,
      message: formatChat(text, this.tokens.loadedSecrets()),
      ...(role === 'bot' ? { for_source_only: true } : {}),
      ...(parentId ? { reply_parent_message_id: parentId } : {})
    });
    const sent = response.data[0];
    if (!sent?.is_sent) throw new Error('Twitch did not send the scripted test message.');
    return sent.message_id;
  }

  async createVodProbeClip(stream: TwitchStream, vodId: string, endOffset: number): Promise<string> {
    await this.requireStream(stream.id);
    const query = new URLSearchParams({
      editor_id: stream.user_id, broadcaster_id: stream.user_id, vod_id: vodId,
      vod_offset: String(Math.max(30, Math.floor(endOffset))), duration: '30', title: 'Stream memory test'
    });
    const created = await this.request('broadcaster', 'POST', `/videos/clips?${query}`, twitchClipCreatedSchema);
    return created.data[0]?.id ?? '';
  }

  async createLiveProbeClip(stream: TwitchStream): Promise<string> {
    await this.requireStream(stream.id);
    const query = new URLSearchParams({ broadcaster_id: stream.user_id, title: 'Stream alignment test' });
    const created = await this.request('broadcaster', 'POST', `/clips?${query}`, twitchClipCreatedSchema);
    return created.data[0]?.id ?? '';
  }

  async clip(id: string) {
    const response = await this.request('app', 'GET', `/clips?${new URLSearchParams({ id })}`, twitchClipsSchema);
    return response.data.find((clip) => clip.id === id);
  }
}

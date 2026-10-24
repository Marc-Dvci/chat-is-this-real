import type { DatabaseSync } from 'node:sqlite';
import type { CheckService } from '../check/service.js';
import { LiveSession } from '../server/live-session.js';
import { ChatStore } from '../store/chat-store.js';
import { readFileSync } from 'node:fs';
import { twitchVideosSchema } from '../shared/schemas.js';

export class DemoSession extends LiveSession {
  private enabled = true;
  constructor(db: DatabaseSync, checks: CheckService) { super(db, checks); }
  override async connect(): Promise<void> { this.enabled = true; }
  override disconnect(): void { this.enabled = false; }
  override status() { return { connected: this.enabled, notice: this.enabled ? 'demo_connected' : 'demo_paused', live_stream_id: this.enabled ? 'demo-stream' : null }; }
  override currentStreamId(): string | undefined { return this.enabled ? 'demo-stream' : undefined; }
  override channelContext() { return { title: 'Recorded development stream', category: 'Just Chatting', language: 'en' }; }
  override async companionState(): ReturnType<LiveSession['companionState']> { return undefined; }
  override async ownedVods(): ReturnType<LiveSession['ownedVods']> {
    const fixture: { response: unknown } = JSON.parse(readFileSync(new URL('../../fixtures/twitch/library-videos.json', import.meta.url), 'utf8'));
    return twitchVideosSchema.parse(fixture.response).data;
  }
  override messages(db: DatabaseSync) { return new ChatStore(db).list(undefined, 'demo-stream'); }
}

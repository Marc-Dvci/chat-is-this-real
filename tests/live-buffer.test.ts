import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { openDatabase } from '../src/store/database.js';
import { ChatStore } from '../src/store/chat-store.js';
import { RequestStore } from '../src/store/request-store.js';
import { LiveBuffer } from '../src/store/live-buffer.js';
import { ChatCore } from '../src/twitch/chat-core.js';
import { EventSubWs } from '../src/twitch/eventsub-ws.js';
import { chatSettingsSchema } from '../src/shared/schemas.js';

it('keeps recorded chat ephemeral and never restores text hidden by a purge', async () => {
  const db = openDatabase(':memory:'), chat = new ChatStore(db), buffer = new LiveBuffer();
  const core = new ChatCore(chat, new RequestStore(db), '900001', '900002', chatSettingsSchema.parse({ history_enabled: false }), {
    onRequest: () => undefined, onMessage: (message) => buffer.put(message), onRemoved: (_ids, scope) => buffer.remove(scope)
  });
  core.setStream('recorded-stream');
  const socket = new EventSubWs({ onSession: async () => undefined, onNotification: (frame) => core.handle(frame), onError: (error) => { throw error; } });
  try {
    for (const frame of (await readFile('fixtures/twitch/probe-1792830555944.jsonl', 'utf8')).trim().split('\n')) await socket.receive(frame);
    const visible = buffer.list(chat, 'recorded-stream'); expect(visible.length).toBeGreaterThan(0);
    expect(chat.list()).toEqual([]);
    const user = visible[0]!.user_id;
    chat.clearUser(user, 'manual-purge', new Date().toISOString(), 'user_request');
    expect(buffer.list(chat, 'recorded-stream').filter((message) => message.user_id === user).every((message) => message.body === null)).toBe(true);
    buffer.clear(); expect(buffer.list(chat, 'recorded-stream')).toEqual([]);
  } finally { socket.close(); db.close(); }
});

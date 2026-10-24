import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { openDatabase } from '../src/store/database.js';
import { ChatStore } from '../src/store/chat-store.js';
import { RequestStore } from '../src/store/request-store.js';
import { CheckStore } from '../src/store/check-store.js';
import { VoteTally } from '../src/votes/tally.js';
import { ChatCore } from '../src/twitch/chat-core.js';
import { EventSubWs } from '../src/twitch/eventsub-ws.js';
import { chatSettingsSchema } from '../src/shared/schemas.js';

it('replays actual Twitch votes through the WebSocket class and keeps the first human vote', async () => {
  const db = openDatabase(':memory:'), checks = new CheckStore(db); let now = 0, id = '';
  const tally = new VoteTally(db, () => now);
  const core = new ChatCore(new ChatStore(db), new RequestStore(db), '900001', '900002', chatSettingsSchema.parse({ history_enabled: true }), {
    onRequest: (request) => { id = request.id; checks.create({ id, claim: request.body, context: [], channel: { title: '', category: '', language: 'en' } }, request.id); tally.open(id, request.broadcast_id, 20); tally.ready(id); },
    onMessage: (message) => { if (message.user_id !== '900002') tally.vote(message); }
  }, () => now);
  core.setStream('recorded-vote-stream');
  const socket = new EventSubWs({ onSession: async () => undefined, onNotification: (frame) => { now = Date.parse(frame.metadata.message_timestamp); core.handle(frame); }, onError: (error) => { throw error; } });
  try {
    for (const frame of (await readFile('fixtures/twitch/probe-1792871642852.jsonl', 'utf8')).trim().split('\n')) await socket.receive(frame);
    expect(id).not.toBe(''); expect(tally.view(id)).toMatchObject({ real: 1, not_real: 0 });
    now += 60_000; tally.reveal(id, 'real');
    expect(tally.scores('recorded-vote-stream')).toEqual([{ user_id: '900001', points: 1 }]);
  } finally { socket.close(); db.close(); }
});

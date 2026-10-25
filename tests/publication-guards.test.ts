import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import { openDatabase } from '../src/store/database.js';
import { ChatStore } from '../src/store/chat-store.js';
import { RequestStore } from '../src/store/request-store.js';
import { ChatCore } from '../src/twitch/chat-core.js';
import { EventSubWs } from '../src/twitch/eventsub-ws.js';
import { TwitchTokens } from '../src/twitch/tokens.js';
import { TwitchHelix } from '../src/twitch/helix.js';
import { TwitchPublisher } from '../src/twitch/publisher.js';
import { chatSettingsSchema } from '../src/shared/schemas.js';

afterEach(() => vi.unstubAllGlobals());
async function recordedRequest() {
  const db = openDatabase(':memory:'), requests = new RequestStore(db);
  const core = new ChatCore(new ChatStore(db), requests, '900001', '900002', chatSettingsSchema.parse({ history_enabled: true }),
    { onRequest: () => undefined }, () => Date.parse('2026-10-24T15:36:00Z'));
  core.setStream('recorded-stream');
  const socket = new EventSubWs({ onSession: async () => undefined, onNotification: (frame) => core.handle(frame), onError: (error) => { throw error; } });
  try { for (const line of (await readFile('fixtures/twitch/probe-1792855780317.jsonl', 'utf8')).trim().split('\n')) await socket.receive(line); }
  finally { socket.close(); }
  const request = requests.list()[0]; if (!request) { db.close(); throw new Error('The recorded Twitch reply did not create a request.'); }
  const tokens = await TwitchTokens.open({ TWITCH_CLIENT_ID: 'demo_application', TWITCH_CLIENT_SECRET: 'publisher-placeholder', TWITCH_CHANNEL: 'demo_streamer', TWITCH_BOT: 'demo_bot' }, join(tmpdir(), `unused-publisher-${randomUUID()}.json`));
  const network = vi.fn(() => { throw new Error('A publication guard must stop before network access.'); }); vi.stubGlobal('fetch', network);
  return { db, requests, request, network, helix: new TwitchHelix(tokens) };
}
it('blocks a recorded request before network access when its broadcaster-started stream is no longer current', async () => {
  const { db, requests, request, network, helix } = await recordedRequest();
  try {
    const publisher = new TwitchPublisher(helix, requests, () => undefined, () => undefined);
    await expect(publisher.reply(request.id, 'Stored result.')).rejects.toThrow('current broadcaster-started stream');
    await expect(publisher.clipReply(request.id, 'Clip ready.')).rejects.toThrow('current broadcaster-started stream');
    expect(network).not.toHaveBeenCalled(); expect(db.prepare('SELECT count(*) AS total FROM publications').get()?.total).toBe(0);
  } finally { db.close(); }
});
it('blocks both publication kinds when source eligibility is withdrawn even while the same stream is current', async () => {
  const { db, requests, request, network, helix } = await recordedRequest();
  try {
    const publisher = new TwitchPublisher(helix, requests, () => request.broadcast_id, () => undefined, () => false);
    await expect(publisher.reply(request.id, 'Stored result.')).rejects.toThrow();
    await expect(publisher.clipReply(request.id, 'Clip ready.')).rejects.toThrow(); expect(network).not.toHaveBeenCalled();
  } finally { db.close(); }
});
it('reserves one delayed clip reply independently of the first result and refuses a duplicate before network access', async () => {
  const { db, requests, request, network, helix } = await recordedRequest();
  try {
    db.prepare("INSERT INTO publications(request_id,kind,status) VALUES(?,'result','sent'),(?,'clip','sent')").run(request.id, request.id);
    const publisher = new TwitchPublisher(helix, requests, () => request.broadcast_id, () => undefined);
    await publisher.clipReply(request.id, 'Clip ready.'); expect(network).not.toHaveBeenCalled();
    expect(db.prepare('SELECT kind FROM publications WHERE request_id=? ORDER BY kind').all(request.id)).toEqual([{ kind: 'clip' }, { kind: 'result' }]);
  } finally { db.close(); }
});

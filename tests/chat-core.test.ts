import { readFile } from 'node:fs/promises';
import { afterEach, expect, it } from 'vitest';
import { openDatabase } from '../src/store/database.js';
import { ChatStore } from '../src/store/chat-store.js';
import { RequestStore } from '../src/store/request-store.js';
import { ChatCore } from '../src/twitch/chat-core.js';
import { EventSubWs } from '../src/twitch/eventsub-ws.js';
import { chatSettingsSchema, sourceDocumentSchema, type CheckOutcome, type CheckRequest, type StoredMessage } from '../src/shared/schemas.js';
import { CheckStore } from '../src/store/check-store.js';
import { evaluateProposal } from '../src/check/proposal.js';

const connections: EventSubWs[] = [];
const databases: ReturnType<typeof openDatabase>[] = [];
afterEach(() => { connections.splice(0).forEach((connection) => connection.close()); databases.splice(0).forEach((db) => db.close()); });

async function replay(core: ChatCore, file = 'fixtures/twitch/probe-1792830555944.jsonl'): Promise<void> {
  const socket = new EventSubWs({ onSession: async () => undefined, onNotification: (frame) => core.handle(frame), onError: (error) => { throw error; } });
  connections.push(socket);
  for (const frame of (await readFile(file, 'utf8')).trim().split('\n')) await socket.receive(frame);
}

function setup(history = true) {
  const db = openDatabase(':memory:'); databases.push(db);
  const chat = new ChatStore(db), requests = new RequestStore(db), created: CheckRequest[] = [];
  const core = new ChatCore(chat, requests, '900001', '900002', chatSettingsSchema.parse({ history_enabled: history }),
    { onRequest: (request) => created.push(request) }, () => Date.parse('2026-10-24T08:29:19Z'));
  core.setStream('recorded-stream');
  return { db, core, chat, requests, created };
}

it('creates one request from the real mention-prefixed reply through the EventSub class', async () => {
  const { core, chat, requests, created } = setup();
  await replay(core);
  await replay(core);
  expect(created).toHaveLength(1);
  expect(created[0]).toMatchObject({ kind: 'real', body: "The Moon is Earth's natural satellite.", author_user_id: '900002', state: 'queued' });
  expect(chat.list('900002')).toHaveLength(1);
  expect(requests.list()).toHaveLength(1);
});

it('keeps history disabled while retaining the explicitly requested source snapshot', async () => {
  const { core, chat, created } = setup(false);
  await replay(core);
  expect(created).toHaveLength(1);
  expect(chat.list()).toEqual([]);
  expect(chat.get(created[0]?.original_message_id ?? '')?.scope).toBe('check');
});

it('removes copied request text, FTS results and later replay attempts after a deletion', async () => {
  const { core, chat, requests, created } = setup();
  await replay(core);
  const request = created[0]; if (!request) throw new Error('The recorded reply must create a request.');
  expect(chat.list(undefined, undefined, 'Moon')).toHaveLength(1);
  expect(chat.deleteMessage(request.original_message_id, request.broadcast_id, '2026-10-24T08:29:20Z')).toEqual([request.id]);
  expect(chat.get(request.original_message_id)?.body).toBeNull();
  expect(requests.get(request.id)).toMatchObject({ body: '', state: 'cancelled', context_ids: [] });
  expect(chat.list(undefined, undefined, 'Moon')).toEqual([]);
  await replay(core);
  expect(chat.get(request.original_message_id)?.body).toBeNull();
  expect(created).toHaveLength(1);
});

it('does not accept a recorded command while the channel is offline', async () => {
  const { core, created } = setup(); core.setStream(undefined);
  await replay(core);
  expect(created).toEqual([]);
});

it('routes the real captured VOD reply with its original question through EventSub', async () => {
  const { core, created } = setup();
  await replay(core, 'fixtures/twitch/probe-1792854590515.jsonl');
  expect(created).toHaveLength(1);
  expect(created[0]).toMatchObject({ kind: 'vod', body: 'What was the promise about fifty pushups and one hundred subscribers?' });
});

it('routes the real captured deletion through EventSub and cancels the stored request', async () => {
  const { core, created, chat, requests } = setup();
  await replay(core, 'fixtures/twitch/probe-1792847799669.jsonl');
  expect(created).toHaveLength(1);
  const request = created[0]; if (!request) throw new Error('The real reply must create a request.');
  expect(chat.get(request.original_message_id)).toMatchObject({ body: null, removed_reason: 'moderation' });
  expect(requests.get(request.id)).toMatchObject({ body: '', state: 'cancelled' });
});

it('scrubs finished check evidence and its cache when the real captured deletion arrives', async () => {
  const { db, chat, requests } = setup();
  const checks = new CheckStore(db);
  const source = sourceDocumentSchema.parse(JSON.parse(await readFile('fixtures/sources/moon-window.json', 'utf8')));
  let checkId = '';
  const core = new ChatCore(chat, requests, '900001', '900002', chatSettingsSchema.parse({ history_enabled: true }), {
    onRequest: (request) => {
      checkId = request.id;
      checks.create({ id: request.id, claim: request.body, context: [], channel: { title: '', category: '', language: 'en' } }, request.id);
      const decision = evaluateProposal({ verdict: 'real', explanation: '', evidence: [{ source_id: source.id, excerpt: source.text, stance: 'supports' }] }, [source]);
      const outcome: CheckOutcome = { id: request.id, type: 'fact', normalized_claim: request.body, triage: null, ...decision,
        explanation: '', sources: [source], sensitive: false, reason: null, created_at: request.created_at, elapsed_ms: 1,
        cache_hit: false, retrieval_mode: 'replay', calls: [], failed: false };
      checks.finish(request.id, outcome); checks.putCache('domain-cache-key', outcome);
      expect(checks.getCache('domain-cache-key')?.id).toBe(request.id);
    }
  });
  core.setStream('recorded-stream');
  await replay(core, 'fixtures/twitch/probe-1792847799669.jsonl');
  expect(checks.get(checkId)).toMatchObject({ input: null, outcome: null, state: 'failed', reason: 'source_removed' });
  expect(checks.getCache('domain-cache-key')).toBeUndefined();
  checks.state(checkId, 'ready');
  expect(checks.get(checkId)?.state).toBe('failed');
  checks.dismiss(checkId);
  expect(checks.get(checkId)).toMatchObject({ input: null, outcome: null, state: 'dismissed' });
});

it('blocks late messages and unknown reply snapshots after a user clear, but accepts new observed speech', () => {
  const { chat } = setup();
  const input: StoredMessage = { id: 'domain-message', broadcast_id: 'recorded-stream', user_id: 'domain-viewer', user_login: 'demo_viewer',
    display_name: 'demo_viewer', body: 'A blue robot puzzle.', badges: [], parent_id: null, created_at: '2026-10-24T08:29:18Z', scope: 'history', removed_reason: null };
  chat.clearUser(input.user_id, input.broadcast_id, '2026-10-24T08:29:20Z');
  expect(chat.put(input)).toBeUndefined();
  expect(chat.put({ ...input, created_at: '2026-10-24T08:29:21Z' }, true)).toBeUndefined();
  expect(chat.put({ ...input, created_at: '2026-10-24T08:29:21Z' })?.body).toBe(input.body);
  chat.purge(14, Date.parse('2026-11-08T08:29:22Z'));
  expect(chat.get(input.id)).toBeUndefined();
});

import { readFile } from 'node:fs/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { EventSubWs } from '../src/twitch/eventsub-ws.js';
import { eventSubEnvelopeSchema, twitchChatEventSchema, type EventSubEnvelope } from '../src/shared/schemas.js';

const clients: EventSubWs[] = [];
afterEach(() => {
  clients.splice(0).forEach((client) => client.close());
  vi.useRealTimers();
});

async function frames(): Promise<string[]> {
  return (await readFile('fixtures/twitch/probe-1792830555944.jsonl', 'utf8')).trim().split('\n');
}

it('receives the real scripted claim and reply through the WebSocket class and deduplicates them', async () => {
  const received: EventSubEnvelope[] = [];
  const sessions: string[] = [];
  const client = new EventSubWs({
    onSession: async (id) => { sessions.push(id); },
    onNotification: (frame) => { received.push(frame); },
    onError: (error) => { throw error; }
  });
  clients.push(client);
  const recorded = await frames();
  for (const raw of recorded) await client.receive(raw);
  const messages = received.map((frame) => twitchChatEventSchema.parse(frame.payload.event));
  expect(sessions).toHaveLength(1);
  expect(messages).toHaveLength(2);
  const claim = messages.find((message) => message.message.text === "The Moon is Earth's natural satellite.");
  const reply = messages.find((message) => message.reply);
  expect(reply?.message.text).toBe('@demo_bot !real');
  expect(reply?.reply?.parent_message_id).toBe(claim?.message_id);
  expect(reply?.reply?.parent_message_body).toBe(claim?.message.text);
  expect(reply?.chatter_user_login).toBe('demo_streamer');
  expect(reply?.badges).toContainEqual({ set_id: 'broadcaster', id: '1', info: '' });
  for (const raw of recorded) await client.receive(raw);
  expect(received).toHaveLength(2);
});

it('refreshes the watchdog for duplicate real notifications without dispatching them again', async () => {
  vi.useFakeTimers();
  const recorded = await frames();
  const welcome = recorded.find((raw) => eventSubEnvelopeSchema.parse(JSON.parse(raw)).metadata.message_type === 'session_welcome');
  const notification = recorded.find((raw) => eventSubEnvelopeSchema.parse(JSON.parse(raw)).metadata.message_type === 'notification');
  if (!welcome || !notification) throw new Error('The live recording must contain a welcome and notification.');
  const envelope = eventSubEnvelopeSchema.parse(JSON.parse(welcome));
  const timeout = ((envelope.payload.session?.keepalive_timeout_seconds ?? 10) + 5) * 1000;
  const errors: Error[] = [];
  let delivered = 0;
  const client = new EventSubWs({
    onSession: async () => undefined,
    onNotification: () => { delivered++; },
    onError: (error) => { errors.push(error); }
  });
  clients.push(client);
  await client.receive(welcome);
  await client.receive(notification);
  vi.advanceTimersByTime(timeout - 1);
  await client.receive(notification);
  vi.advanceTimersByTime(timeout - 1);
  expect(errors).toHaveLength(0);
  expect(delivered).toBe(1);
  vi.advanceTimersByTime(1);
  expect(errors[0]?.message).toContain('keepalive timed out');
  client.close();
});

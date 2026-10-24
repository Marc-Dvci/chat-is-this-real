import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import type { z } from 'zod';
import { dashboardSessionSchema, checkListSchema, requestListSchema, eventSubCreatedSchema, probeReportSchema, testBroadcastSchema, twitchChatEventSchema, type VodOutcome } from '../src/shared/schemas.js';
import { loadTwitchConfig } from '../src/twitch/config.js';
import { TwitchTokens } from '../src/twitch/tokens.js';
import { TwitchHelix } from '../src/twitch/helix.js';
import { EventSubWs } from '../src/twitch/eventsub-ws.js';
import { exportProbeFixtures, ProbeRecording } from '../src/twitch/probe-recording.js';
import { alignRecordedProbe } from '../src/twitch/probe-alignment.js';
import { chunkOffset } from '../src/vod/align.js';
import { clipWindow } from '../src/vod/clips.js';
import { buildVodReply } from '../src/shared/reply-text.js';
import { openDatabase } from '../src/store/database.js';
import { RequestStore } from '../src/store/request-store.js';
import { TwitchPublisher } from '../src/twitch/publisher.js';

const execute = promisify(execFile), root = 'http://127.0.0.1:4747';
const question = 'What was the promise about fifty pushups and one hundred subscribers?';
async function probe(): Promise<void> {
  if (process.env.LIVE !== '1' || !process.argv.includes('--live')) throw new Error('Use LIVE=1 and --live for the authorized prerecorded test.');
  const abort = new AbortController(), stop = () => abort.abort();
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  const tokens = await TwitchTokens.open(loadTwitchConfig()), helix = new TwitchHelix(tokens, abort.signal);
  const manifest = testBroadcastSchema.parse(JSON.parse(await readFile('data/test-stream/broadcast.json', 'utf8')));
  const stream = await helix.currentStream();
  if (!stream || manifest.ended_at || stream.id !== manifest.stream_id || !manifest.source_wall_start_ms) throw new Error('The approved recording must be live.');
  const broadcaster = await tokens.get('broadcaster'), bot = await tokens.get('bot');
  if (!broadcaster.user_id || !bot.user_id) throw new Error('Reconnect Twitch.');
  const run = String(Date.now()), directory = join('data/probe', run);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const capture = new ProbeRecording(directory, tokens.loadedSecrets());
  const report = probeReportSchema.parse({ run, recorded_at: new Date().toISOString(), stream_id: stream.id,
    stream_started_at: stream.started_at, broadcaster_id: broadcaster.user_id, bot_id: bot.user_id, source: 'recording' });
  const observations: Record<string, unknown> = { suite: 'vod-live', split: 'scripted-live', source: 'Original prerecorded system narration', run,
    git_commit: (await execute('git', ['rev-parse', 'HEAD'])).stdout.trim(), created_at: report.recorded_at, passed: false, stage: 'waiting' };
  let connected = false, socketError = false, outcome: VodOutcome | undefined;
  const received = new Set<string>();
  const socket = new EventSubWs({ onSession: async (id) => {
    await helix.request('bot', 'POST', '/eventsub/subscriptions', eventSubCreatedSchema, { type: 'channel.chat.message', version: '1',
      condition: { broadcaster_user_id: broadcaster.user_id, user_id: bot.user_id }, transport: { method: 'websocket', session_id: id } }); connected = true;
  }, onNotification: (frame) => {
    const event = twitchChatEventSchema.safeParse(frame.payload.event); if (event.success) received.add(event.data.message_id);
  }, onRawFrame: (raw) => capture.capture(raw), onError: () => { socketError = true; } });
  async function get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    const response = await fetch(`${root}${path}`, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10_000)]) });
    if (!response.ok) throw new Error('The local API refused the probe.');
    return schema.parse(await response.json());
  }
  async function waitFor(condition: () => Promise<boolean> | boolean, seconds: number): Promise<void> {
    const deadline = Date.now() + seconds * 1000;
    while (Date.now() < deadline) {
      abort.signal.throwIfAborted(); if (socketError) throw new Error('The recording socket disconnected.');
      if (await condition()) return;
      await delay(500, undefined, { signal: abort.signal });
    }
    throw new Error('The live VOD check did not reach its required state.');
  }
  try {
    socket.connect(); await waitFor(() => connected, 30);
    console.info('Waiting until the scripted promise is more than five minutes old.');
    await waitFor(() => Date.now() >= manifest.source_wall_start_ms! + 365_000, 400);
    await waitFor(async () => {
      const current = testBroadcastSchema.parse(JSON.parse(await readFile('data/test-stream/broadcast.json', 'utf8')));
      if (current.stream_id !== stream.id || current.ended_at) throw new Error('The authorized recording ended.');
      return current.source_seconds >= 365;
    }, 30);
    observations.stage = 'command';
    const seed = await helix.sendScriptedTestMessage(stream, 'bot', question);
    await waitFor(() => received.has(seed), 15);
    const command = await helix.sendScriptedTestMessage(stream, 'broadcaster', '!vod', seed);
    await waitFor(() => received.has(command), 15);
    report.normal_message = true; report.reply_message = true; report.threaded_reply = true;
    observations.stage = 'answer';
    let requestId: string | undefined;
    await waitFor(async () => { requestId = (await get('/api/requests', requestListSchema)).requests.find((item) => item.command_message_id === command)?.id; return Boolean(requestId); }, 15);
    await waitFor(async () => {
      const job = (await get('/api/checks', checkListSchema)).checks.find((item) => item.id === requestId);
      if (job?.state === 'failed') throw new Error('The real VOD request failed.');
      if (job?.outcome?.type === 'vod') outcome = job.outcome;
      return Boolean(outcome?.found);
    }, 50);
    if (!outcome || !requestId || outcome.offset_s === null) throw new Error('No stored VOD moment was returned.');
    observations.same_broadcast = outcome.broadcast_id === stream.id;
    if (outcome.broadcast_id !== stream.id) throw new Error('The live check matched a different broadcast.');
    const expected = chunkOffset(new Date(manifest.source_wall_start_ms + 60_000).toISOString(), stream.started_at,
      Number(process.env.VOD_OFFSET_CORRECTION_S ?? 0));
    observations.expected_offset_s = expected; observations.observed_offset_s = outcome.offset_s;
    observations.offset_error_s = Math.abs(outcome.offset_s - expected);
    observations.moment_age_s = (Date.now() - manifest.source_wall_start_ms) / 1000 - 60;
    if (Math.abs(outcome.offset_s - expected) > 15) throw new Error('The moment missed the required offset window.');
    console.info('The real command found the stored promise within the required time window.');
    observations.stage = 'clip';
    const session = await get('/api/session', dashboardSessionSchema);
    const created = await fetch(`${root}/api/checks/${requestId}/clip`, { method: 'POST', signal: AbortSignal.timeout(10_000),
      headers: { 'Content-Type': 'application/json', 'x-dashboard-token': session.csrf_token }, body: JSON.stringify({ confirmed: true }) });
    if (!created.ok) throw new Error('The local clip confirmation was refused.');
    await waitFor(async () => {
      const job = (await get('/api/checks', checkListSchema)).checks.find((item) => item.id === requestId);
      if (job?.outcome?.type === 'vod') outcome = job.outcome;
      return outcome?.clip?.state === 'ready';
    }, 75);
    if (!outcome.clip?.clip_id || !outcome.clip.clip_url || outcome.end_s === null) throw new Error('No clip became ready.');
    report.vod_id = outcome.vod_id ?? undefined;
    report.alignment_clip_id = outcome.clip.clip_id;
    const bounds = clipWindow(outcome.offset_s!, outcome.end_s);
    report.alignment_clip_start_s = bounds.end - bounds.duration;
    await capture.save(report);
    observations.stage = 'playback';
    let alignment: Awaited<ReturnType<typeof alignRecordedProbe>> | undefined;
    const downloadDeadline = Date.now() + 40_000;
    while (!alignment && Date.now() < downloadDeadline) {
      try { alignment = await alignRecordedProbe(report, tokens); }
      catch { await delay(2000, undefined, { signal: abort.signal }); }
    }
    if (!alignment) throw new Error('The created clip did not become downloadable and decodable.');
    report.recording_alignment = alignment; report.vod_clip_id = outcome.clip.clip_id; report.vod_clip_playable = true;
    observations.clip_playable = true; observations.recording_alignment = alignment;
    const alignedExpected = 60 + alignment.observed_vod_offset_s - alignment.source_offset_s;
    observations.aligned_expected_offset_s = alignedExpected; observations.aligned_offset_error_s = Math.abs(outcome.offset_s! - alignedExpected);
    if (Math.abs(outcome.offset_s! - alignedExpected) > 15) throw new Error('The decoded clip did not confirm the stored timestamp.');
    observations.stage = 'reply';
    const db = openDatabase('data/chat.db');
    try {
      const requests = new RequestStore(db), notices: string[] = [];
      const publisher = new TwitchPublisher(helix, requests, () => stream.id, (code) => notices.push(code));
      await publisher.reply(requestId, buildVodReply(outcome.offset_s!, outcome.quote, outcome.clip.clip_url, tokens.loadedSecrets()));
      observations.reply_sent = db.prepare("SELECT status FROM publications WHERE request_id=? AND kind='result'").get(requestId)?.status === 'sent';
      if (!observations.reply_sent) throw new Error('The result reply was not sent.');
    } finally { db.close(); }
    observations.passed = true;
    observations.stage = 'complete';
    console.info('Playable clip and the formatted live reply verified.');
  } finally {
    socket.close(); observations.output = outcome ?? null;
    await capture.save(report);
    if (report.threaded_reply) await exportProbeFixtures(report, tokens.loadedSecrets(), false, { claim: question, command: '!vod' });
    await mkdir('eval/results', { recursive: true });
    await writeFile(`eval/results/vod-live-${run}.json`, JSON.stringify(observations, null, 2));
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
  }
}
void probe().catch(() => { console.error('Live VOD probe stopped. Inspect the saved observations and private recordings.'); process.exitCode = 1; });

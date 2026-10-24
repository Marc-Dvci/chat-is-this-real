import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { join } from 'node:path';
import { chatSettingsSchema, probeReportSchema, testBroadcastSchema, type CheckRequest } from '../src/shared/schemas.js';
import { openDatabase } from '../src/store/database.js';
import { ChatStore } from '../src/store/chat-store.js';
import { RequestStore } from '../src/store/request-store.js';
import { ChatCore } from '../src/twitch/chat-core.js';
import { loadTwitchConfig } from '../src/twitch/config.js';
import { TwitchHelix } from '../src/twitch/helix.js';
import { exportProbeFixtures, ProbeRecording, probeClaim } from '../src/twitch/probe-recording.js';
import { TwitchPublisher } from '../src/twitch/publisher.js';
import { TwitchRuntime } from '../src/twitch/runtime.js';
import { TwitchTokens } from '../src/twitch/tokens.js';

async function probe(): Promise<void> {
  if (!process.argv.includes('--live')) throw new Error('Use --live during the authorized prerecorded test stream.');
  const abort = new AbortController();
  const stop = () => abort.abort();
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  const tokens = await TwitchTokens.open(loadTwitchConfig());
  const helix = new TwitchHelix(tokens, abort.signal);
  const stream = await helix.currentStream();
  const manifest = testBroadcastSchema.parse(JSON.parse(await readFile('data/test-stream/broadcast.json', 'utf8')));
  if (!stream || manifest.ended_at || manifest.stream_id !== stream.id) throw new Error('Start the authorized prerecorded test stream before the core probe.');
  const broadcaster = await tokens.get('broadcaster'), bot = await tokens.get('bot');
  if (!broadcaster.user_id || !bot.user_id || !broadcaster.scopes.includes('moderator:manage:chat_messages')) throw new Error('Authorize test-message deletion before the core probe.');
  const run = String(Date.now()), directory = join('data/probe', run);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const recording = new ProbeRecording(directory, tokens.loadedSecrets());
  const db = openDatabase(join(directory, 'chat.db'));
  const chat = new ChatStore(db), requests = new RequestStore(db);
  const notices: string[] = [];
  const report = probeReportSchema.parse({ run, recorded_at: new Date().toISOString(), stream_id: stream.id,
    stream_started_at: stream.started_at, broadcaster_id: broadcaster.user_id, bot_id: bot.user_id, source: 'recording' });
  let created: CheckRequest | undefined, acknowledgement: Promise<void> | undefined;
  const publisher = new TwitchPublisher(helix, requests, () => runtime.liveStreamId(), (code) => notices.push(code));
  const core = new ChatCore(chat, requests, broadcaster.user_id, bot.user_id, chatSettingsSchema.parse({ history_enabled: true }), {
    onRequest: (request) => {
      created = request; report.core_request_created = true;
      const started = performance.now();
      acknowledgement = publisher.acknowledge(request.id).then(() => {
        report.acknowledgement_ms = performance.now() - started;
        report.acknowledgement_sent = db.prepare("SELECT status FROM publications WHERE request_id=? AND kind='ack'").get(request.id)?.status === 'sent';
      });
    }, onNotice: (code) => notices.push(code)
  });
  const runtime = new TwitchRuntime(core, helix, (code) => notices.push(code), (raw) => recording.capture(raw));
  async function waitFor(condition: () => boolean, seconds: number): Promise<void> {
    const deadline = Date.now() + seconds * 1000;
    while (!condition() && Date.now() < deadline) { abort.signal.throwIfAborted(); await delay(100, undefined, { signal: abort.signal }); }
    if (!condition()) throw new Error('The live core check did not reach its expected state.');
  }
  try {
    await runtime.start(); await waitFor(() => runtime.liveStreamId() === stream.id, 30);
    const claimId = await helix.sendScriptedTestMessage(stream, 'bot', probeClaim);
    await waitFor(() => !!chat.get(claimId)?.body, 15);
    await helix.sendScriptedTestMessage(stream, 'broadcaster', '!real', claimId);
    await waitFor(() => !!created, 15);
    await acknowledgement;
    await helix.deleteScriptedTestMessage(stream, claimId);
    await waitFor(() => chat.get(claimId)?.body === null && !!created && requests.get(created.id)?.state === 'cancelled', 15);
    report.moderated_text_removed = true;
    report.normal_message = true; report.reply_message = true;
    await recording.save(report);
    await exportProbeFixtures(report, tokens.loadedSecrets(), true);
    console.info('Live request creation, acknowledgement and moderation removal verified. Recorded frames exported.');
  } finally {
    runtime.stop(); await acknowledgement?.catch(() => undefined);
    await recording.save(report);
    await writeFile(join(directory, 'notices.json'), JSON.stringify(notices), { mode: 0o600 });
    db.close(); process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
  }
}

void probe().catch(() => { console.error('Core probe stopped. Check authorization, the test stream and private probe reports.'); process.exitCode = 1; });

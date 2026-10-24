import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import { buildApp } from '../src/server/app.js';
import { openDatabase } from '../src/store/database.js';
import { dashboardSessionSchema, deskSnapshotSchema, eventSubCreatedSchema, overlayLiveReportSchema, overlayViewSchema, probeReportSchema, testBroadcastSchema, twitchChatEventSchema } from '../src/shared/schemas.js';
import { TwitchTokens } from '../src/twitch/tokens.js';
import { loadTwitchConfig } from '../src/twitch/config.js';
import { TwitchHelix } from '../src/twitch/helix.js';
import { EventSubWs } from '../src/twitch/eventsub-ws.js';
import { exportProbeFixtures, ProbeRecording } from '../src/twitch/probe-recording.js';

async function probe(): Promise<void> {
  if (process.env.LIVE !== '1' || !process.argv.includes('--live')) throw new Error('Use LIVE=1 and --live for the approved prerecorded stream.');
  process.env.SEARCH_MODE = 'replay'; process.env.SEARCH_REPLAY_PATH = 'fixtures/search/dev.json';
  const tokens = await TwitchTokens.open(loadTwitchConfig()), helix = new TwitchHelix(tokens);
  const stream = await helix.currentStream(), manifest = testBroadcastSchema.parse(JSON.parse(await readFile('data/test-stream/broadcast.json', 'utf8')));
  if (!stream || manifest.ended_at || manifest.stream_id !== stream.id) throw new Error('The authorized recording must be live.');
  const broadcaster = await tokens.get('broadcaster'), bot = await tokens.get('bot');
  if (!broadcaster.user_id || !bot.user_id) throw new Error('Reconnect Twitch.');
  const run = String(Date.now()), directory = join('data/probe', run), claim = 'The Sun is a star.';
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const db = openDatabase(join(directory, 'chat.db')), app = buildApp({ db });
  const root = await app.listen({ host: '127.0.0.1', port: 0 });
  const browser = await chromium.launch({ headless: true }).catch(async (error: unknown) => { await app.close(); db.close(); throw error; });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: directory, size: { width: 1920, height: 1080 } } });
  const overlay = await context.newPage();
  const recording = new ProbeRecording(directory, tokens.loadedSecrets()), received = new Set<string>(), extraIds: string[] = [];
  const probeReport = probeReportSchema.parse({ run, recorded_at: new Date().toISOString(), stream_id: stream.id, stream_started_at: stream.started_at, broadcaster_id: broadcaster.user_id, bot_id: bot.user_id, source: 'recording' });
  const report = overlayLiveReportSchema.parse({ suite: 'overlay-live', run, created_at: probeReport.recorded_at,
    git_commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), working_tree_dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()), stage: 'connect', passed: false,
    three_viewer_acceptance: false, eligible_voters_observed: 0, bot_filtered: false, duplicate_rejected: false, approval_held: false, score_once: false,
    source: 'Authorized prerecorded stream', fixture: null, result: null });
  let connected = false, socketFailed = false, headers: Record<string, string> = {}, jobId = '';
  const socket = new EventSubWs({ onSession: async (id) => {
    await helix.request('bot', 'POST', '/eventsub/subscriptions', eventSubCreatedSchema, { type: 'channel.chat.message', version: '1', condition: { broadcaster_user_id: broadcaster.user_id, user_id: bot.user_id }, transport: { method: 'websocket', session_id: id } }); connected = true;
  }, onNotification: (frame) => { const value = twitchChatEventSchema.safeParse(frame.payload.event); if (value.success) received.add(value.data.message_id); }, onRawFrame: (raw) => recording.capture(raw), onError: () => { socketFailed = true; } });
  const post = async (path: string, body: unknown = {}, method = 'POST') => {
    const response = await fetch(`${root}${path}`, { method, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error('The local control action was refused.'); return response.json() as Promise<unknown>;
  };
  const view = async () => overlayViewSchema.parse(await (await fetch(`${root}/api/overlay`, { signal: AbortSignal.timeout(10_000) })).json());
  const wait = async (condition: () => Promise<boolean> | boolean, seconds = 30) => {
    const deadline = Date.now() + seconds * 1000;
    while (Date.now() < deadline) { if (socketFailed) throw new Error('The recording socket disconnected.'); if (await condition()) return; await delay(150); }
    throw new Error('The live overlay check did not reach its expected state.');
  };
  try {
    headers = { 'x-dashboard-token': dashboardSessionSchema.parse(await (await fetch(`${root}/api/session`)).json()).csrf_token };
    await post('/api/settings', { history_enabled: true, overlay_enabled: true, votes_enabled: true, dwell_s: 20 }, 'PATCH');
    socket.connect(); await wait(() => connected);
    await post('/api/twitch/connect');
    await wait(async () => deskSnapshotSchema.parse(await (await fetch(`${root}/api/desk`)).json()).twitch.live_stream_id === stream.id);
    await overlay.goto(`${root}/overlay`);
    const seed = await helix.sendScriptedTestMessage(stream, 'bot', claim); await wait(() => received.has(seed));
    const command = await helix.sendScriptedTestMessage(stream, 'broadcaster', '!real', seed); await wait(() => received.has(command));
    probeReport.normal_message = true; probeReport.reply_message = true; probeReport.threaded_reply = true;
    report.stage = 'voting';
    await wait(async () => { const current = await view(); jobId = current.presentation.job_id ?? jobId;
      if (jobId && db.prepare('SELECT state FROM check_jobs WHERE id=?').get(jobId)?.state === 'failed') throw new Error('The live check failed before voting.');
      return Boolean(jobId && current.votes); });
    await overlay.screenshot({ path: join(directory, 'overlay-checking.png'), omitBackground: true });
    const first = await helix.sendScriptedTestMessage(stream, 'broadcaster', '1'); extraIds.push(first); await wait(() => received.has(first));
    await wait(() => Number(db.prepare('SELECT count(*) AS total FROM votes WHERE job_id=? AND user_id=? AND choice=1').get(jobId, broadcaster.user_id!)?.total) === 1);
    const automated = await helix.sendScriptedTestMessage(stream, 'bot', '2'); extraIds.push(automated); await wait(() => received.has(automated));
    const duplicate = await helix.sendScriptedTestMessage(stream, 'broadcaster', '2'); extraIds.push(duplicate); await wait(() => received.has(duplicate)); await delay(500);
    report.bot_filtered = Number(db.prepare('SELECT count(*) AS total FROM votes WHERE user_id=?').get(bot.user_id)?.total) === 0;
    report.duplicate_rejected = Number(db.prepare('SELECT count(*) AS total FROM votes WHERE job_id=? AND user_id=?').get(jobId, broadcaster.user_id)?.total) === 1;
    await wait(() => db.prepare('SELECT state FROM check_jobs WHERE id=?').get(jobId)?.state === 'ready', 50);
    const pending = await view(); report.approval_held = pending.presentation.phase === 'checking' && pending.result === null;
    await post('/api/presentation', { action: 'show_check', id: jobId });
    await wait(async () => ['reveal', 'dwell'].includes((await view()).presentation.phase));
    const result = await view(); report.result = result.result; report.stage = 'revealed';
    await overlay.screenshot({ path: join(directory, 'overlay-revealed.png'), omitBackground: true });
    report.eligible_voters_observed = Number(db.prepare('SELECT count(*) AS total FROM votes WHERE job_id=?').get(jobId)?.total);
    const before = Number(db.prepare("SELECT count(*) AS total FROM votes JOIN vote_sessions USING(job_id) WHERE job_id=? AND ((revealed_verdict='real' AND choice=1) OR (revealed_verdict='not_real' AND choice=2))").get(jobId)?.total);
    await post('/api/presentation', { action: 'show_check', id: jobId });
    const after = Number(db.prepare("SELECT count(*) AS total FROM votes JOIN vote_sessions USING(job_id) WHERE job_id=? AND ((revealed_verdict='real' AND choice=1) OR (revealed_verdict='not_real' AND choice=2))").get(jobId)?.total);
    report.score_once = before === 1 && after === before;
    report.passed = report.bot_filtered && report.duplicate_rejected && report.approval_held && report.score_once && result.result?.type === 'fact' && result.result.verdict === 'real';
    report.stage = report.passed ? 'complete' : 'observations_need_review';
    if (!report.passed) throw new Error('The live overlay assertions did not all pass.');
    console.info('Real Twitch vote, bot exclusion, duplicate rejection and approved reveal verified. This run used one eligible voter.');
  } catch (error) {
    report.reason = String(db.prepare('SELECT reason FROM check_jobs ORDER BY created_at DESC LIMIT 1').get()?.reason ?? 'probe_wait_or_transport');
    throw error;
  } finally {
    try {
    socket.close();
    if (headers['x-dashboard-token']) await post('/api/twitch/disconnect').catch(() => undefined);
    await recording.save(probeReport);
    if (probeReport.threaded_reply) { await exportProbeFixtures(probeReport, tokens.loadedSecrets(), false, { claim, command: '!real', message_ids: extraIds }); report.fixture = `fixtures/twitch/probe-${run}.jsonl`; }
    await mkdir('eval/results', { recursive: true }); await writeFile(`eval/results/overlay-live-${run}.json`, JSON.stringify(overlayLiveReportSchema.parse(report), null, 2));
    } finally { await context.close().catch(() => undefined); await browser.close(); await app.close(); db.close(); }
  }
}
void probe().catch(() => { console.error('Live overlay probe stopped. Inspect the saved observations and private captures.'); process.exitCode = 1; });

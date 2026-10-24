import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import {
  eventSubCreatedSchema, probeOptionsSchema, probeReportSchema, twitchChatEventSchema,
  type ProbeReport, type TwitchStream
} from '../src/shared/schemas.js';
import { loadTwitchConfig } from '../src/twitch/config.js';
import { EventSubWs } from '../src/twitch/eventsub-ws.js';
import { TwitchHelix } from '../src/twitch/helix.js';
import { exportProbeFixtures, ProbeRecording, probeClaim } from '../src/twitch/probe-recording.js';
import { alignRecordedProbe } from '../src/twitch/probe-alignment.js';
import { TwitchHttpError, TwitchTokens } from '../src/twitch/tokens.js';

function parseTime(value: string): number {
  if (!/^\d{1,3}:[0-5]\d:[0-5]\d(?:\.\d{1,3})?$/.test(value)) throw new Error('Use H:MM:SS for the observed clap time.');
  const parts = value.split(':').map(Number);
  return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
}

async function pollClip(helix: TwitchHelix, id: string): Promise<boolean> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if ((await helix.clip(id))?.url) return true;
    await delay(2000, undefined, helix.signal ? { signal: helix.signal } : {});
  }
  return false;
}

async function finalize(run: string, observed: string | undefined, tokens: TwitchTokens, autoAlign: boolean): Promise<void> {
  if (!/^\d{13}$/.test(run)) throw new Error('Use the run ID printed by the probe.');
  const path = join('data/probe', run, 'report.json');
  const report = probeReportSchema.parse(JSON.parse(await readFile(path, 'utf8')));
  const broadcaster = await tokens.get('broadcaster');
  if (report.broadcaster_id !== broadcaster.user_id) throw new Error('This probe belongs to a different broadcaster.');
  if (report.run !== run) throw new Error('The probe run does not match its report.');
  if (autoAlign && report.source === 'recording') {
    report.recording_alignment = await alignRecordedProbe(report, tokens);
    report.observed_clap_offset_s = report.recording_alignment.observed_vod_offset_s;
    report.clap_unadjusted_offset_s = (report.recording_alignment.source_wall_start_ms - Date.parse(report.stream_started_at)) / 1000 + report.recording_alignment.source_offset_s;
  } else {
    if (report.clap_unadjusted_offset_s === undefined || !observed) throw new Error('Capture the clap first, or use --auto-align for a prerecorded probe.');
    report.observed_clap_offset_s = parseTime(observed);
  }
  if (!report.normal_message || !report.reply_message || !report.threaded_reply) throw new Error('Complete the chat and threaded-reply checks first.');
  if (!report.vod_clip_playable && !report.live_clip_playable) throw new Error('Verify a playable clip before finalizing the probe.');
  if (!report.vod_id) {
    const vod = await new TwitchHelix(tokens).vodForStream(report.broadcaster_id, report.stream_id);
    if (!vod) throw new Error('The test stream archive must be available to verify its clap offset and timestamp link.');
    report.vod_id = vod.id;
  }
  report.correction_s = Math.round((report.observed_clap_offset_s - report.clap_unadjusted_offset_s) * 1000) / 1000;
  if (Math.abs(report.correction_s) > 120) throw new Error('The observed clap differs by over two minutes. Check the playback time.');
  if (autoAlign) {
    const seconds = Math.floor(report.observed_clap_offset_s);
    const link = `https://www.twitch.tv/videos/${report.vod_id}?t=${Math.floor(seconds / 3600)}h${Math.floor(seconds / 60) % 60}m${seconds % 60}s`;
    const response = await fetch(link, { signal: AbortSignal.timeout(10_000) });
    await response.body?.cancel();
    if (response.status !== 200) throw new Error('The VOD timestamp page did not answer successfully. Check it before finalizing.');
  }
  const frames = await exportProbeFixtures(report, tokens.loadedSecrets());
  await writeFile(path, JSON.stringify(report, null, 2), { mode: 0o600 });
  for (const envPath of ['.env', '.env.example']) {
    const text = await readFile(envPath, 'utf8');
    const line = `VOD_OFFSET_CORRECTION_S=${report.correction_s}`;
    const updated = /^VOD_OFFSET_CORRECTION_S=.*$/m.test(text)
      ? text.replace(/^VOD_OFFSET_CORRECTION_S=.*$/m, line) : `${text.trimEnd()}\n${line}\n`;
    await writeFile(envPath, envPath === '.env.example'
      ? updated.replace(/^# (?:M1 measures this correction with the clap test before VOD alignment is used\.|Clap correction measured in probe .*|VOD offset correction measured in probe .*)$/m,
        `# VOD offset correction measured in probe ${run}; see docs/probe.md.`) : updated);
  }
  const clip = report.vod_clip_playable ? report.vod_clip_id : report.live_clip_id;
  const doc = [
    '# Twitch probe', '', `Recorded ${report.recorded_at}. Run: \`${run}\`.`, '',
    '| Check | Observed result |', '|---|---|',
    '| Normal message and reply | Received through EventSub |',
    '| Threaded bot reply | Sent with the app token; Twitch confirmed is_sent |',
    `| In-progress archive | ${report.in_progress_vod_listed ? 'Returned by Get Videos and matched by stream_id' : 'Archive became available after the live capture; use the VOD link when available'} |`,
    `| Clip From VOD | ${report.vod_clip_playable ? 'Playable clip returned' : 'Use a VOD timestamp link by default; see the private run report for the API outcome'} |`,
    `| Live clip | ${report.live_clip_playable ? 'Playable clip returned' : 'See the private run report'} |`,
    `| ${report.source === 'recording' ? 'Source timecode' : 'Clap'} correction | ${report.correction_s} seconds |`,
    `| Recorded fixtures | ${frames} captured frames, with account identifiers pseudonymized |`, '',
    `Playable test clip: https://clips.twitch.tv/${clip}`, '',
    'Reproduce with `npm run probe:twitch -- --live` during an explicitly started test stream.',
    'Capture files and account mappings stay under the ignored data directory.', '',
    'The fixture export retains the scripted claim and reply. Usernames and identifiers are pseudonymized.',
    'Protocol frames originate from Twitch; the exporter does not synthesize events.', '',
    ...(report.source === 'recording' ? ['This probe uses the original prerecorded test video and system speech.',
      'Alignment matches a decoded Twitch clip timecode against the source video. Recalibrate for a different encoder or audio capture path.', ''] : []),
    'API references: [EventSub](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/) and',
    '[Clip From VOD](https://dev.twitch.tv/docs/api/reference/#create-clip-from-vod).', ''
  ].join('\n');
  await writeFile('docs/probe.md', doc);
  console.info(`Probe finalized. Offset correction: ${report.correction_s} s. Review the exported fixtures before committing.`);
}

async function liveProbe(twitch: TwitchHelix, stream: TwitchStream, seconds: number, automated = false): Promise<void> {
  const controller = new AbortController();
  const helix = new TwitchHelix(twitch.tokens, controller.signal);
  const bot = await helix.tokens.get('bot');
  const run = String(Date.now());
  const directory = join('data/probe', run);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const recording = new ProbeRecording(directory, helix.tokens.loadedSecrets());
  const report: ProbeReport = probeReportSchema.parse({
    run, recorded_at: new Date().toISOString(), stream_id: stream.id,
    stream_started_at: stream.started_at, broadcaster_id: stream.user_id, bot_id: bot.user_id,
    source: automated ? 'recording' : 'manual'
  });
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  let stopped = false;
  let replyInFlight = false;
  let fatal: Error | undefined;
  const stop = () => { stopped = true; controller.abort(); terminal.close(); };
  const client = new EventSubWs({
    onRawFrame: (raw) => {
      try { recording.capture(raw); } catch (error) {
        fatal = error instanceof Error ? error : new Error('Probe capture failed.');
        client.close();
        stop();
        throw error;
      }
    },
    onError: (error, terminalError) => {
      console.error(error.message);
      if (terminalError) { fatal = error; stop(); }
    },
    onSession: async (sessionId) => {
      const events = ['channel.chat.message', 'channel.chat.message_delete', 'channel.chat.clear_user_messages', 'channel.chat.clear', 'stream.online', 'stream.offline'];
      await Promise.all(events.map((type) => helix.request('bot', 'POST', '/eventsub/subscriptions', eventSubCreatedSchema, {
        type, version: '1', transport: { method: 'websocket', session_id: sessionId },
        condition: { broadcaster_user_id: stream.user_id, ...(type.startsWith('channel.chat.') ? { user_id: bot.user_id } : {}) }
      })));
      console.info(`EventSub connected. From a viewer account, send: ${probeClaim}`);
      console.info('From the broadcaster account, reply to that message with !real.');
      if (automated) {
        const parent = await helix.sendScriptedTestMessage(stream, 'bot', probeClaim);
        await helix.sendScriptedTestMessage(stream, 'broadcaster', '!real', parent);
        console.info('Sent the scripted test claim and broadcaster command through Twitch.');
      }
    },
    onNotification: async (frame) => {
      if (frame.payload.subscription?.type === 'stream.offline') { fatal = new Error('The test stream ended.'); stop(); return; }
      if (frame.payload.subscription?.type !== 'channel.chat.message') return;
      const event = twitchChatEventSchema.parse(frame.payload.event);
      if (event.broadcaster_user_id !== stream.user_id || (event.source_broadcaster_user_id && event.source_broadcaster_user_id !== stream.user_id)) return;
      if (event.message.text.trim() === probeClaim && (automated || (event.chatter_user_id !== bot.user_id && event.chatter_user_id !== stream.user_id))) report.normal_message = true;
      const command = event.message.text.replace(/^(?:@\S+\s+)*/u, '').trim();
      if (command !== '!real' || event.chatter_user_id !== stream.user_id || event.reply?.parent_message_body !== probeClaim) return;
      report.reply_message = true;
      if (report.threaded_reply || replyInFlight) return;
      replyInFlight = true;
      try {
        await helix.sendProbeReply(stream, event.reply.parent_message_id);
        report.threaded_reply = true;
        console.info('Threaded reply confirmed by Twitch.');
      } catch (error) {
        fatal = error instanceof Error ? error : new Error('Threaded reply failed.');
        stop();
      } finally { replyInFlight = false; }
    }
  });
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    client.connect();
    console.info(`Recording run ${run}. This command may post one scripted reply and create test clips.`);
    if (!automated) {
      await terminal.question('Press Enter when ready to clap on camera. Clap when CLAP appears. ', { signal: controller.signal });
      console.info('Clap in 3 seconds.');
      await delay(3000, undefined, { signal: controller.signal });
      report.clap_wall_ms = Date.now();
      report.clap_unadjusted_offset_s = (report.clap_wall_ms - Date.parse(stream.started_at)) / 1000;
      console.info('CLAP');
    } else console.info('Using the prerecorded source timecode for alignment.');
    try {
      report.live_clip_id = await helix.createLiveProbeClip(stream);
    } catch {
      if (stopped) return;
      console.info('Live clip was unavailable. The VOD clip or link is the fallback.');
    }
    const vod = await helix.currentVod(stream);
    if (vod) { report.vod_id = vod.id; report.in_progress_vod_listed = true; }
    const age = (Date.now() - Date.parse(stream.started_at)) / 1000;
    if (vod && age >= 150) {
      try {
        report.vod_clip_id = await helix.createVodProbeClip(stream, vod.id, age - 120 + 8);
        report.vod_clip_status = 'created';
      } catch (error) {
        if (stopped) return;
        report.vod_clip_status = error instanceof TwitchHttpError ? `http_${error.status}` : 'request_failed';
      }
    } else report.vod_clip_status = vod ? 'stream_under_150_seconds' : 'archive_not_listed';
    if (report.live_clip_id) report.live_clip_playable = await pollClip(helix, report.live_clip_id);
    if (report.vod_clip_id) {
      report.vod_clip_playable = await pollClip(helix, report.vod_clip_id);
      report.vod_clip_status = report.vod_clip_playable ? 'playable' : 'poll_timeout';
    }
    const deadline = Date.now() + seconds * 1000;
    while (!stopped && !fatal && (!report.normal_message || !report.threaded_reply) && Date.now() < deadline) await delay(250);
    if (fatal) throw fatal;
  } finally {
    controller.abort();
    client.close();
    terminal.close();
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    await recording.save(report);
    console.info(`Saved run ${run}. Finalize after verifying the clip and alignment:`);
    console.info(automated ? `npm run probe:twitch -- --finalize ${run} --auto-align`
      : `npm run probe:twitch -- --finalize ${run} --clap-offset H:MM:SS --clip-played --vod-link-checked`);
    if (report.vod_id) {
      const offset = Math.max(0, Math.floor((report.clap_unadjusted_offset_s ?? 5) - 5));
      console.info(`VOD: https://www.twitch.tv/videos/${report.vod_id}?t=${Math.floor(offset / 3600)}h${Math.floor(offset / 60) % 60}m${offset % 60}s`);
    }
    if (report.vod_clip_playable) console.info(`VOD clip: https://clips.twitch.tv/${report.vod_clip_id}`);
    if (report.live_clip_playable) console.info(`Live clip: https://clips.twitch.tv/${report.live_clip_id}`);
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: {
    live: { type: 'boolean', default: false }, seconds: { type: 'string', default: '600' },
    finalize: { type: 'string' }, 'clap-offset': { type: 'string' },
    'clip-played': { type: 'boolean', default: false }, 'vod-link-checked': { type: 'boolean', default: false },
    automated: { type: 'boolean', default: false }, 'auto-align': { type: 'boolean', default: false }
  } });
  const tokens = await TwitchTokens.open(loadTwitchConfig());
  if (values.finalize) {
    if (!values['auto-align'] && (!values['clip-played'] || !values['vod-link-checked'])) throw new Error('Watch the test clip and check the VOD timestamp link, then confirm with --clip-played --vod-link-checked.');
    await finalize(values.finalize, values['clap-offset'], tokens, values['auto-align']);
    return;
  }
  const options = probeOptionsSchema.parse({ live: values.live, seconds: Number(values.seconds) });
  await tokens.get('bot');
  await tokens.get('broadcaster');
  const helix = new TwitchHelix(tokens);
  const stream = await helix.currentStream();
  if (!stream) throw new Error('Start your test stream before the live probe.');
  if (!options.live) {
    console.info('Twitch authorization is valid and the broadcaster is live. Use --live to record the probe and allow its scripted reply and test clips.');
    return;
  }
  if (Date.now() - Date.parse(stream.started_at) < 150_000) throw new Error('Let the test stream run for at least 2 minutes 30 seconds before the live probe.');
  await liveProbe(helix, stream, options.seconds, values.automated);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error && !(error instanceof SyntaxError) ? error.message : 'Twitch probe failed. Check the local run report.');
  process.exitCode = 1;
});

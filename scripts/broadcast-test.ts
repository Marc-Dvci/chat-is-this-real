import { spawn } from 'node:child_process';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { rootCertificates } from 'node:tls';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import {
  testBroadcastOptionsSchema, testBroadcastSchema, twitchChannelsSchema, twitchEmptyResponseSchema,
  twitchGamesSchema, twitchIngestsSchema, twitchStreamKeySchema
} from '../src/shared/schemas.js';
import { loadTwitchConfig } from '../src/twitch/config.js';
import { TwitchHelix } from '../src/twitch/helix.js';
import { testStreamScopes } from '../src/twitch/oauth.js';
import { TwitchTokens } from '../src/twitch/tokens.js';
import { writeAtomic } from '../src/shared/atomic-file.js';
import { ffmpegBinary } from '../src/shared/ffmpeg.js';

async function broadcast(): Promise<void> {
  const { values } = parseArgs({ options: { live: { type: 'boolean', default: false }, seconds: { type: 'string', default: '1200' } } });
  const options = testBroadcastOptionsSchema.parse({ live: values.live, seconds: Number(values.seconds) });
  if (!options.live) throw new Error('Use --live only when the broadcaster has authorized this prerecorded public test.');
  await stat('data/test-stream/recording.mp4');
  const tokens = await TwitchTokens.open(loadTwitchConfig());
  const broadcaster = await tokens.get('broadcaster');
  if (testStreamScopes.some((scope) => !broadcaster.scopes.includes(scope))) throw new Error('Run npm run setup:twitch -- --automation first.');
  const helix = new TwitchHelix(tokens);
  if (await helix.currentStream()) throw new Error('The broadcaster is already live. Keep that stream under their control.');
  const query = new URLSearchParams({ broadcaster_id: broadcaster.user_id ?? '' });
  const previous = (await helix.request('app', 'GET', `/channels?${query}`, twitchChannelsSchema)).data[0];
  if (!previous || previous.broadcaster_id !== broadcaster.user_id) throw new Error('Could not verify broadcaster settings.');
  const games = await helix.request('app', 'GET', `/games?${new URLSearchParams({ name: 'Just Chatting' })}`, twitchGamesSchema);
  const gameId = games.data.find((game) => game.name === 'Just Chatting')?.id ?? '0';
  const response = await fetch('https://ingest.twitch.tv/ingests', { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error('Could not read Twitch ingest endpoints.');
  const ingests = twitchIngestsSchema.parse(await response.json());
  const ingest = ingests.ingests.find((server) => server.name === 'Default') ?? ingests.ingests[0];
  if (!ingest) throw new Error('Twitch did not return an ingest endpoint.');
  const safeHost = new URL(ingest.url_template_secure.replace('{stream_key}', 'placeholder'));
  if (safeHost.protocol !== 'rtmps:' || !safeHost.hostname.endsWith('.live-video.net') || safeHost.username || safeHost.password) {
    throw new Error('Twitch returned an unexpected secure ingest endpoint.');
  }
  const key = (await helix.request('broadcaster', 'GET', `/streams/key?${query}`, twitchStreamKeySchema)).data[0]?.stream_key;
  if (!key) throw new Error('Twitch did not return a stream key.');
  await mkdir('data/test-stream', { recursive: true, mode: 0o700 });
  await writeFile('data/test-stream/ca.pem', rootCertificates.join('\n'));
  const title = 'Chat Is This Real | prerecorded development test';
  await helix.request('broadcaster', 'PATCH', `/channels?${query}`, twitchEmptyResponseSchema, { title, game_id: gameId, broadcaster_language: 'en' });
  const manifest = testBroadcastSchema.parse({
    created_at: new Date().toISOString(), encoder_pid: 0, encoder_started_ms: Date.now()
  });
  let writes = Promise.resolve();
  const persist = (): Promise<void> => {
    const snapshot = JSON.stringify(manifest, null, 2);
    const operation = writes.then(() => writeAtomic('data/test-stream/broadcast.json', snapshot));
    writes = operation.catch(() => undefined);
    return operation;
  };
  const encoder = spawn(ffmpegBinary(), [
    '-hide_banner', '-loglevel', 'error', '-re', '-i', 'data/test-stream/recording.mp4',
    '-t', String(options.seconds),
    '-c:v', 'copy', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '128k',
    '-f', 'flv', '-flvflags', 'no_duration_filesize', '-progress', 'pipe:2',
    '-tls_verify', '1', '-ca_file', 'data/test-stream/ca.pem',
    ingest.url_template_secure.replace('{stream_key}', key)
  ], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
  manifest.encoder_pid = encoder.pid ?? 0;
  let progress = '';
  let saveAt = 0;
  let encoderClosed = false;
  let encoderFailed = false;
  encoder.stdin.on('error', () => undefined);
  const ended = new Promise<number | null>((done) => {
    encoder.once('error', () => { encoderClosed = true; encoderFailed = true; done(null); });
    encoder.once('close', (code) => { encoderClosed = true; done(code); });
  });
  encoder.stderr.on('data', (chunk: Buffer) => {
    progress += chunk.toString('utf8');
    const lines = progress.split(/\r?\n/);
    progress = (lines.pop() ?? '').slice(-1024);
    for (const line of lines) {
      const match = /^out_time_us=(\d+)$/.exec(line);
      if (!match) continue;
      manifest.source_seconds = Number(match[1]) / 1_000_000;
      if (manifest.source_wall_start_ms === undefined && manifest.source_seconds > 0) {
        manifest.source_wall_start_ms = Date.now() - manifest.source_seconds * 1000;
      }
      if (Date.now() - saveAt > 5000) {
        saveAt = Date.now();
        void persist().catch(() => stop());
      }
    }
  });
  const stop = () => {
    if (encoderClosed) return;
    if (!encoder.stdin.destroyed) encoder.stdin.write('q\n');
    const timeout = setTimeout(() => { if (!encoderClosed) encoder.kill(); }, 5000);
    timeout.unref();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    await persist();
    for (let attempt = 0; attempt < 30; attempt++) {
      if (encoderClosed || encoderFailed) throw new Error('The test encoder exited before the stream became live.');
      const stream = await helix.currentStream();
      if (stream) {
        manifest.stream_id = stream.id;
        manifest.stream_started_at = stream.started_at;
        await persist();
        console.info('Prerecorded test stream is live. Only the prepared video and system narration are being broadcast.');
        break;
      }
      await delay(2000);
    }
    if (!manifest.stream_id) throw new Error('Twitch did not report the prerecorded stream as live.');
    console.info('The encoder stops when the recording ends. Press Ctrl+C to stop it sooner.');
    const code = await ended;
    if (code !== 0) throw new Error('The test encoder stopped with an error. The stream key has been kept out of logs.');
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    if (!encoderClosed) { stop(); await ended; }
    await writes;
    manifest.ended_at = new Date().toISOString();
    await persist();
    const current = (await helix.request('app', 'GET', `/channels?${query}`, twitchChannelsSchema)).data[0];
    if (current?.title === title && current.game_id === gameId) {
      await helix.request('broadcaster', 'PATCH', `/channels?${query}`, twitchEmptyResponseSchema, {
        title: previous.title || 'Chat Is This Real', game_id: previous.game_id, broadcaster_language: previous.broadcaster_language
      });
    }
    console.info('Prerecorded test stream stopped.');
  }
}

void broadcast().catch(() => {
  console.error('Could not complete the prerecorded broadcast. Check the test video, automation authorization and Twitch streaming eligibility. Credentials are kept out of encoder logs.');
  process.exitCode = 1;
});

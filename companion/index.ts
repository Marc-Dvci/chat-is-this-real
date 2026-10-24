import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, unlink, rmdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { ModelClient } from '../src/llm/client.js';
import { loadModelConfig } from '../src/llm/config.js';
import { loadLocalEnv } from '../src/shared/env.js';
import { companionConfigSchema, companionOptionsSchema, companionStateSchema } from '../src/shared/schemas.js';
import { assertNoSecretFragments } from '../src/shared/format-chat.js';
import { loadedSecrets } from '../src/shared/secrets.js';
import { ffmpegBinary, mediaInputOptions, transcribeAudio } from '../src/vod/audio.js';

async function run(): Promise<void> {
  loadLocalEnv();
  const { values } = parseArgs({ options: { list: { type: 'boolean' }, file: { type: 'string' }, 'wall-start': { type: 'string' }, seconds: { type: 'string' } } });
  const options = companionOptionsSchema.parse({ ...values, wall_start: values['wall-start'] });
  const format = companionConfigSchema.shape.AUDIO_INPUT_FORMAT.parse(process.env.AUDIO_INPUT_FORMAT ?? (process.platform === 'win32' ? 'dshow' : process.platform === 'darwin' ? 'avfoundation' : 'pulse'));
  if (options.list) {
    const args = format === 'pulse' ? ['-sources', 'pulse'] : format === 'dshow' ? ['-list_devices', 'true', '-f', format, '-i', 'dummy']
      : ['-f', format, '-list_devices', 'true', '-i', ''];
    const child = spawn(ffmpegBinary, ['-hide_banner', ...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '';
    child.stdout.on('data', (chunk: Buffer) => { text = (text + chunk.toString()).slice(-30_000); });
    child.stderr.on('data', (chunk: Buffer) => { text = (text + chunk.toString()).slice(-30_000); });
    await new Promise<void>((done, reject) => { child.once('error', reject); child.once('close', () => done()); });
    assertNoSecretFragments(text, loadedSecrets()); console.info(text); return;
  }
  const config = companionConfigSchema.parse({ ...process.env, AUDIO_INPUT_FORMAT: format, AUDIO_DEVICE: options.file ? 'recording' : process.env.AUDIO_DEVICE });
  if (options.file && !options.wall_start) throw new Error('Recording input requires --wall-start from its actual broadcast.');
  const server = new URL(config.COMPANION_SERVER);
  if (server.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(server.hostname) || server.pathname !== '/' || server.search || server.hash || server.username || server.password) throw new Error('Use a local companion server.');
  const abort = new AbortController();
  const sessionResponse = await fetch(new URL('/api/session', server), { signal: AbortSignal.timeout(10_000) });
  const session: unknown = await sessionResponse.json();
  if (!session || typeof session !== 'object' || !('csrf_token' in session) || typeof session.csrf_token !== 'string') throw new Error('Start the local dashboard first.');
  const stateResponse = await fetch(new URL('/api/companion/state', server), { signal: AbortSignal.timeout(10_000) });
  if (!stateResponse.ok) throw new Error('Connect Twitch during the prerecorded or live stream first.');
  const state = companionStateSchema.parse(await stateResponse.json());
  const model = new ModelClient(loadModelConfig());
  const vocabulary = Object.fromEntries(['Chat', state.channel, state.category, ...state.commands].filter((word) => word && word.length <= 80).map((word) => [word, 5]));
  await mkdir('data/audio', { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(resolve('data/audio/capture-'));
  const input = options.file ? ['-re', ...mediaInputOptions, '-i', resolve(options.file)]
    : ['-f', format, '-i', format === 'dshow' ? `audio=${config.AUDIO_DEVICE}` : format === 'avfoundation' ? `:${config.AUDIO_DEVICE}` : config.AUDIO_DEVICE];
  const child = spawn(ffmpegBinary, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...input,
    ...(options.seconds ? ['-t', String(options.seconds)] : []), '-vn', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le',
    '-progress', 'pipe:1', '-stats_period', '0.25', '-f', 'segment', '-segment_time', '15', '-segment_list', 'chunks.csv',
    '-segment_list_type', 'csv', '-reset_timestamps', '1', 'chunk-%06d.wav'], { cwd: directory, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let ended = false, failed = false, encoderError: Error | undefined;
  let origin = options.wall_start ? Date.parse(options.wall_start) : undefined, progress = '';
  child.stdout.on('data', (chunk: Buffer) => {
    progress += chunk.toString();
    let newline: number;
    while ((newline = progress.indexOf('\n')) >= 0) {
      const line = progress.slice(0, newline).trim(); progress = progress.slice(newline + 1);
      if (origin === undefined && /^out_time_us=\d+$/u.test(line)) origin = Date.now() - Number(line.slice(12)) / 1000;
    }
  });
  // Device paths and decoder diagnostics can contain local account information.
  child.stderr.resume();
  child.once('error', (error) => { encoderError = error; ended = true; failed = true; });
  child.once('close', (code) => { ended = true; failed = failed || code !== 0; });
  const stop = () => { abort.abort(); child.kill(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  const processed = new Set<string>(); let previous = '';
  try {
    console.info('Audio companion started. Audio chunks are deleted after processing.');
    while (true) {
      abort.signal.throwIfAborted();
      let list = '';
      try { list = await readFile(join(directory, 'chunks.csv'), 'utf8'); }
      catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
      const chunks = list.split('\n').flatMap((line) => {
        const match = /^(chunk-\d{6}\.wav),(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)\r?$/u.exec(line);
        return match?.[1] && match[2] && match[3] && !processed.has(match[1]) ? [{ file: match[1], start: Number(match[2]), end: Number(match[3]) }] : [];
      });
      if (chunks.length > 8) throw new Error('The audio companion fell behind.');
      for (const chunk of chunks) {
        if (origin === undefined) throw new Error('The audio clock was not established.');
        const path = join(directory, chunk.file);
        try {
          const result = await transcribeAudio(model, await readFile(path), previous, vocabulary, abort.signal);
          previous = result.text;
          const response = await fetch(new URL('/api/transcript/chunk', server), { method: 'POST',
            signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10_000)]),
            headers: { 'Content-Type': 'application/json', 'x-dashboard-token': session.csrf_token },
            body: JSON.stringify({ broadcast_id: state.broadcast_id, chunk_id: randomUUID(), chunk_wall_start: new Date(origin + chunk.start * 1000).toISOString(),
              duration_s: result.duration, text: result.text, words: result.words }) });
          if (!response.ok) throw new Error('The dashboard did not accept the transcript chunk.');
          console.info(`Indexed audio at ${chunk.start.toFixed(1)}s${result.fallback ? ' with approximate timing' : ''}.`);
          processed.add(chunk.file);
        } finally { await unlink(path).catch(() => undefined); }
      }
      if (ended) { if (failed || encoderError) throw new Error('Audio capture stopped unexpectedly. Check the selected input.'); break; }
      await delay(250, undefined, { signal: abort.signal });
    }
  } finally {
    const closed = ended ? Promise.resolve() : new Promise<void>((done) => child.once('close', () => done()));
    if (!ended) child.kill(); await closed;
    for (const file of await readdir(directory)) if (/^(?:chunk-\d{6}\.wav|chunks\.csv)$/u.test(file)) await unlink(join(directory, file));
    await rmdir(directory);
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
  }
}

void run().catch(() => { console.error('Audio companion stopped. Check the local dashboard, stream, input device and model allowance.'); process.exitCode = 1; });

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { filmCaptureLocatorSchema, loudnessMeasurementSchema } from '../src/shared/schemas.js';
import { ffprobeBinary } from '../src/shared/ffmpeg.js';
import { verifyFrozenEngine } from '../eval/freeze.js';

const execute = promisify(execFile), root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = `${root}/data/submission`; await mkdir(directory, { recursive: true });
const checks: { name: string; passed: boolean; elapsed_ms: number; log: string }[] = [];
async function command(name: string, file: string, args: string[]) {
  console.info(`Release check: ${name}.`); const started = performance.now(), log = `${directory}/${name}.log`;
  try { const result = await execute(file, args, { cwd: root, windowsHide: true, maxBuffer: 8_000_000, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
    await writeFile(log, result.stdout + result.stderr); checks.push({ name, passed: true, elapsed_ms: performance.now() - started, log }); return result.stdout;
  } catch (error) { const value = error instanceof Error ? error : new Error('Unknown check error.');
    const output = 'stdout' in value && typeof value.stdout === 'string' ? value.stdout : '';
    const errors = 'stderr' in value && typeof value.stderr === 'string' ? value.stderr : '';
    await writeFile(log, output + errors); checks.push({ name, passed: false, elapsed_ms: performance.now() - started, log }); throw new Error(`Release check failed: ${name}. See its private log.`, { cause: error });
  }
}
const assetsOnly = process.argv.includes('--assets-only');
let passed = false;
try {
  if (!assetsOnly) {
  await command('types', process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit']);
  await command('lint', process.execPath, ['node_modules/eslint/bin/eslint.js', '.', '--max-warnings', '0']);
  await command('units', process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--reporter=json', `--outputFile=${directory}/unit-tests.json`]);
  await command('build-types', process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json']);
  await command('build-demo', process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/build-demo.ts']);
  await command('build-web', process.execPath, ['node_modules/vite/bin/vite.js', 'build']);
  const browser = await command('browser', process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--reporter=json']);
  await writeFile(`${directory}/browser-tests.json`, browser);
  await command('worker', process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'deploy', '--config', 'worker/wrangler.toml', '--dry-run', '--outdir', '.cache/worker-build']);
  await command('corpus-lock', process.execPath, ['node_modules/tsx/dist/cli.mjs', 'eval/run.ts', '--verify-lock']);
  }
  await verifyFrozenEngine();
  const readme = await readFile(`${root}/README.md`, 'utf8');
  for (const match of readme.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)) { const href = match[1]; if (href && !/^(?:https?:|#)/u.test(href)) await stat(resolve(root, href.split('#')[0] ?? href)); }
  const gallery: unknown = JSON.parse(await readFile(`${root}/docs/gallery/manifest.json`, 'utf8'));
  if (!gallery || typeof gallery !== 'object' || !('sheets' in gallery) || !Array.isArray(gallery.sheets) || gallery.sheets.length !== 12) throw new Error('Missing gallery manifest.');
  for (const item of gallery.sheets as unknown[]) {
    if (!item || typeof item !== 'object' || !('file' in item) || typeof item.file !== 'string' || !('caption' in item) || typeof item.caption !== 'string' || item.caption.length > 140) throw new Error('Invalid gallery entry.');
    const bytes = await readFile(`${root}/docs/gallery/${item.file}`); if (bytes.readUInt32BE(16) !== 2400 || bytes.readUInt32BE(20) !== 1600) throw new Error('Wrong gallery dimensions.');
  }
  const render = filmCaptureLocatorSchema.parse(JSON.parse(await readFile(`${root}/data/film/latest-render.json`, 'utf8')));
  const audio: unknown = JSON.parse(await readFile(`${root}/${render.directory}/audio-audit.json`, 'utf8'));
  if (!audio || typeof audio !== 'object' || !('mastered' in audio)) throw new Error('Missing encoded-audio measurement.');
  const loudness = loudnessMeasurementSchema.parse(audio.mastered); if (loudness.input_tp > -1 || Math.abs(loudness.input_i + 14) > .6) throw new Error('Invalid film audio master.');
  const mediaText = await command('film-media', ffprobeBinary(), ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,r_frame_rate', '-of', 'json', `${directory}/chat-is-this-real-launch.mp4`]);
  const media: unknown = JSON.parse(mediaText);
  if (!media || typeof media !== 'object' || !('streams' in media) || !Array.isArray(media.streams) || !('format' in media) || !media.format || typeof media.format !== 'object' || !('duration' in media.format)) throw new Error('Invalid film streams.');
  if (Number(media.format.duration) !== 165 || !media.streams.some((stream: unknown) => stream && typeof stream === 'object' && 'codec_type' in stream && stream.codec_type === 'subtitle')
    || !media.streams.some((stream: unknown) => stream && typeof stream === 'object' && 'width' in stream && stream.width === 2560 && 'height' in stream && stream.height === 1440 && 'r_frame_rate' in stream && stream.r_frame_rate === '30/1')) throw new Error('Invalid film export.');
  passed = true;
} finally {
  await writeFile(`${directory}/${assetsOnly ? 'artifact' : 'release'}-validation.json`, JSON.stringify({ passed, created_at: new Date().toISOString(), git_commit: (await execute('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim(), checks,
    film_sha256: createHash('sha256').update(await readFile(`${directory}/chat-is-this-real-launch.mp4`)).digest('hex') }, null, 2));
}
console.info('Release checks passed, including gallery dimensions, local README links, frozen engine and film media/audio.');

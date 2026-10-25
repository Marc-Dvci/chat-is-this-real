import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import Fastify from 'fastify';
import { chromium } from '@playwright/test';
import { filmBuildOutputSchema, filmCaptureLocatorSchema, filmCaptureSchema, filmTimelineSchema, filmVoteProofSchema, claimRunSummarySchema, publicBaseSchema, loudnessMeasurementSchema } from '../src/shared/schemas.js';
import { loadDemoCatalog } from '../src/demo/replay.js';
import { openDatabase } from '../src/store/database.js';
import { seedDemo } from '../src/demo/seed.js';
import { CheckStore } from '../src/store/check-store.js';
import { PublicResults } from '../src/server/public-result.js';
import { clockText } from '../src/shared/reply-text.js';
import { excerptPreview } from '../src/shared/excerpt-preview.js';
import { ffmpegBinary, ffprobeBinary } from '../src/shared/ffmpeg.js';
import { stageHTML, type FilmReceipt, type FilmStageData } from '../film/stage.js';
import { writeOriginalScore } from '../film/score.js';

const execute = promisify(execFile), preview = process.argv.includes('--preview');
const option = (name: string) => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
const width = preview ? 1280 : 2560, height = width * 9 / 16, fps = preview ? 12 : 30;
const timeline = filmTimelineSchema.parse(JSON.parse(await readFile('film/timeline.json', 'utf8'))), secondsPerBar = timeline.beats_per_bar * 60 / timeline.bpm, duration = secondsPerBar * timeline.total_bars;
if (duration >= 180 || timeline.scenes.some((scene, index) => scene.start_bar !== (timeline.scenes[index - 1]?.end_bar ?? 0)) || timeline.scenes.at(-1)?.end_bar !== timeline.total_bars) throw new Error('The film timeline must be continuous and under three minutes.');
const site = option('--site') ? publicBaseSchema.parse(option('--site')) : '';
const locator = filmCaptureLocatorSchema.parse(JSON.parse(await readFile('data/film/latest-capture.json', 'utf8'))), capture = filmCaptureSchema.parse(JSON.parse(await readFile(`${locator.directory}/capture.json`, 'utf8')));
const proof = filmVoteProofSchema.parse(JSON.parse(await readFile(`${locator.directory}/vote-proof.json`, 'utf8')));
const build = filmBuildOutputSchema.parse(JSON.parse(await readFile('data/film/build-output.json', 'utf8')));
const directory = `data/film/render-${Date.now()}`, outputDirectory = 'data/submission'; await mkdir(directory, { recursive: true }); await mkdir(outputDirectory, { recursive: true });
const ffmpeg = ffmpegBinary(), probe = ffprobeBinary();
const command = async (args: string[]) => execute(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...args], { windowsHide: true, maxBuffer: 2_000_000 });
await command(['-y', '-ss', '43', '-i', resolve('../footage/codex/M0-2026-10-24_0909.mkv'), '-t', '11', '-an', '-c:v', 'libx264', '-threads', '4', '-preset', 'veryfast', '-crf', '18', '-g', '15', '-pix_fmt', 'yuv420p', `${directory}/codex.mp4`]);
let measurement: FilmStageData['measurement'] = null;
const reportPath = option('--report');
if (reportPath) { const report = claimRunSummarySchema.parse(JSON.parse(await readFile(reportPath, 'utf8'))); measurement = { label: `${report.split.toUpperCase()} · ${report.sample_count} CLAIMS · CURATED SEARCH REPLAY`,
  agreement: `${report.metrics.verdict_agreement.matched}/${report.metrics.verdict_agreement.total}`, excerpts: `${report.metrics.excerpts.verified}/${report.metrics.excerpts.returned}`, wrongDirection: String(report.metrics.wrong_direction_errors) }; }
else if (!preview) throw new Error('Pass the frozen final evaluation report with --report for the final film.');
const db = openDatabase(':memory:'), catalog = loadDemoCatalog(); seedDemo(db, catalog);
const store = new CheckStore(db), project = new PublicResults(db);
function receipt(key: string): FilmReceipt { const job = store.get(`demo-check-${key}`); if (!job) throw new Error('Missing filmed check.'); const value = project.project(job);
  if (value.type !== 'fact' || !value.evidence[0]) throw new Error('A filmed claim needs verified evidence.'); const item = value.evidence[0], source = value.sources.find((source) => source.id === item.source_id); if (!source) throw new Error('Missing filmed source.');
  return { claim: value.claim, verdict: value.verdict, explanation: value.explanation, excerpt: excerptPreview(item.excerpt), domain: source.domain }; }
const vodJob = store.get('demo-check-showcase-vod'); if (!vodJob) throw new Error('Missing filmed VOD moment.'); const vod = project.project(vodJob); if (vod.type !== 'vod' || !vod.found || vod.offset_s === null) throw new Error('A filmed VOD quote must resolve.');
const negativeJob = store.get('demo-check-vod-not-found'); if (!negativeJob) throw new Error('Missing filmed negative VOD result.'); const negative = project.project(negativeJob); if (negative.type !== 'vod' || negative.found) throw new Error('The negative coverage must come from a stored miss.');
const app = Fastify({ logger: false }), files = new Map<string, { path: string; mime: string }>();
const add = (name: string, path: string, mime = 'image/png') => { files.set(name, { path: resolve(path), mime }); return `/asset/${name}`; };
const data: FilmStageData = { timeline, images: {
  desk: add('desk', `${locator.directory}/desk.png`), history: add('history', `${locator.directory}/history.png`),
  'overlay-fact': add('overlay-fact', `${locator.directory}/overlay-fact.png`), 'overlay-vod': add('overlay-vod', `${locator.directory}/overlay-vod.png`),
  'twitch-proof': add('twitch-proof', 'data/probe/1792871642852/overlay-revealed.png'), dock: add('dock', 'e2e/screens/desk-dock-checks.png') },
  videos: { desk: add('desk-video', capture.video, 'video/webm'), twitch: add('twitch-video', 'data/probe/1792855780317/alignment-clip.mp4', 'video/mp4'), codex: add('codex-video', `${directory}/codex.mp4`, 'video/mp4') },
  receipts: { en: receipt('showcase-en'), fr: receipt('showcase-fr'), es: receipt('showcase-es') },
  vod: { quote: excerptPreview(vod.quote), time: clockText(vod.offset_s), coverage: negative.coverage.map((item, index) => `Stream ${index + 1}  ·  ${clockText(item.start_s)} to ${clockText(item.end_s)}  ·  ${item.segment_count} segments`) },
  votes: { total: proof.votes.real + proof.votes.not_real, real: proof.votes.real, not_real: proof.votes.not_real },
  capture: Object.fromEntries(capture.events.map((event) => [event.name, event.at_s])), diff: build.diff, buildOutput: build.output, measurement, site };
db.close();
const fonts = { heading: (await readFile('node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff2')).toString('base64'), body: (await readFile('node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2')).toString('base64') };
app.get('/', async (_request, reply) => reply.type('text/html').send(stageHTML(data, fonts, width, height)));
app.get<{ Params: { name: string } }>('/asset/:name', async (request, reply) => {
  const file = files.get(request.params.name); if (!file) return reply.code(404).send(); const size = (await stat(file.path)).size;
  const range = /^bytes=(\d+)-(\d*)$/u.exec(request.headers.range ?? ''), start = Number(range?.[1] ?? 0), end = Math.min(size - 1, Number(range?.[2] || size - 1));
  if (start > end || start >= size) return reply.code(416).header('Content-Range', `bytes */${size}`).send();
  reply.type(file.mime).header('Accept-Ranges', 'bytes').header('Content-Length', end - start + 1); if (range) reply.code(206).header('Content-Range', `bytes ${start}-${end}/${size}`);
  return reply.send(createReadStream(file.path, { start, end }));
});
const address = await app.listen({ host: '127.0.0.1', port: 0 }), browser = await chromium.launch({ headless: true });
const silent = join(directory, 'picture.mp4'), encoder = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-vcodec', 'png', '-framerate', String(fps), '-i', 'pipe:0', '-an', '-vf', 'scale=in_range=full:out_range=limited:out_color_matrix=bt709', '-c:v', 'libx264', '-threads', '4', '-preset', preview ? 'veryfast' : 'medium', '-crf', preview ? '22' : '18', '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart', silent], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
let encoderError = ''; encoder.stderr.on('data', (bytes: Buffer) => { encoderError = (encoderError + bytes.toString('utf8')).slice(-4000); });
const encoded = new Promise<void>((resolve, reject) => { encoder.once('error', reject); encoder.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Film encoder failed: ${encoderError}`))); });
void encoded.catch(() => undefined);
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: width / 1920 }); await page.goto(address);
  await page.waitForFunction(() => typeof window.film?.seek === 'function' || document.body.dataset.error, undefined, { timeout: 30_000 });
  const stageError = await page.locator('body').getAttribute('data-error'); if (stageError) throw new Error(stageError);
  const frames = Math.round(duration * fps);
  for (let index = 0; index < frames; index++) {
    await page.evaluate((time) => window.film.seek(time), index / fps); const bytes = await page.screenshot({ type: 'png' });
    if (!encoder.stdin.write(bytes)) await once(encoder.stdin, 'drain');
    if (index % (fps * 10) === 0) console.info(`Film frames: ${Math.round(index / fps)} / ${duration} seconds.`);
  }
  await page.evaluate(() => window.film.seek(window.film.duration - 2.2)); await page.screenshot({ path: `${directory}/thumbnail.png` });
  encoder.stdin.end(); await encoded;
} finally { if (!encoder.stdin.writableEnded) { encoder.stdin.destroy(); encoder.kill(); } await browser.close(); await app.close(); }
await writeOriginalScore(`${directory}/score.wav`, duration, timeline.bpm);
const stamp = (value: number) => { const ms = Math.round(value * 1000); return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
const captions = timeline.captions.map((item, index) => `${index + 1}\n${stamp(item.start_bar * secondsPerBar)} --> ${stamp(item.end_bar * secondsPerBar)}\n${item.text}\n`).join('\n');
await writeFile(`${directory}/captions.srt`, captions);
const audioStart = 44 * secondsPerBar, audioEnd = 48 * secondsPerBar, mix = `[0:a]volume='if(between(t,${audioStart},${audioEnd}),0.26,0.85)':eval=frame[bed];[1:a]atrim=start=3:end=10.5,asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,adelay=${audioStart * 1000}|${audioStart * 1000},apad[voice];[bed][voice]amix=inputs=2:normalize=0:duration=first,lowpass=f=17000[audio]`;
await command(['-y', '-i', `${directory}/score.wav`, '-i', 'data/probe/1792855780317/alignment-clip.mp4', '-filter_complex', mix, '-map', '[audio]', '-c:a', 'pcm_f32le', '-t', String(duration), `${directory}/mix.wav`]);
async function measure(path: string) {
  const result = await execute(ffmpeg, ['-hide_banner', '-nostats', '-i', path, '-vn', '-af', 'loudnorm=I=-14:TP=-2.5:LRA=7:print_format=json', '-f', 'null', '-'], { windowsHide: true, maxBuffer: 2_000_000 });
  const match = /\{\s*"input_i"[\s\S]*?\}/u.exec(result.stderr); if (!match) throw new Error('Missing measured film loudness.'); return loudnessMeasurementSchema.parse(JSON.parse(match[0]));
}
const loudness = await measure(`${directory}/mix.wav`), normalization = `loudnorm=I=-14:TP=-2.5:LRA=7:measured_I=${loudness.input_i}:measured_TP=${loudness.input_tp}:measured_LRA=${loudness.input_lra}:measured_thresh=${loudness.input_thresh}:offset=${loudness.target_offset}:linear=true,alimiter=limit=0.749894:level=false`;
const output = `${directory}/chat-is-this-real-${preview ? 'preview' : 'launch'}.mp4`;
await command(['-y', '-i', silent, '-i', `${directory}/mix.wav`, '-i', `${directory}/captions.srt`, '-map', '0:v:0', '-map', '1:a:0', '-map', '2:s:0', '-af', normalization, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng', '-t', String(duration), '-movflags', '+faststart', output]);
const mastered = await measure(output); await writeFile(`${directory}/audio-audit.json`, JSON.stringify({ input: loudness, mastered }, null, 2));
if (mastered.input_tp > -1 || Math.abs(mastered.input_i + 14) > .6) throw new Error('The film audio master needs another level pass.');
const info = await execute(probe, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,r_frame_rate', '-of', 'json', output], { windowsHide: true });
const target = `${outputDirectory}/chat-is-this-real-${preview ? 'preview' : 'launch'}.mp4`;
await copyFile(output, target); await copyFile(`${directory}/captions.srt`, `${outputDirectory}/chat-is-this-real-en.srt`); await copyFile(`${directory}/thumbnail.png`, `${outputDirectory}/chat-is-this-real-thumbnail.png`);
await writeFile(`${directory}/render.json`, JSON.stringify({ source: 'Actual recorded product/Twitch/Codex footage with original motion graphics and synthesized score.', preview, width, height, fps, duration_s: duration, report: reportPath ?? null, site, capture: locator.directory, output: target, sha256: createHash('sha256').update(await readFile(target)).digest('hex'), media: JSON.parse(info.stdout) as unknown }, null, 2));
await writeFile('data/film/latest-render.json', JSON.stringify({ directory, output: target }, null, 2)); console.info(`Film ready: ${target}`);

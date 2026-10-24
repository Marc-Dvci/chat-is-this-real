import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { testBroadcastSchema, twitchClipDownloadsSchema, type ProbeReport } from '../shared/schemas.js';
import { TwitchHelix } from './helix.js';
import type { TwitchTokens } from './tokens.js';

const run = promisify(execFile);
const pixels = 200 * 24;
const frameFilter = 'scale=1280:720,crop=600:72:80:536,scale=200:24,format=gray';

async function boundedDownload(url: string, path: string): Promise<void> {
  const parsed = new URL(url);
  const allowed = ['twitch.tv', 'twitchcdn.net', 'ttvnw.net', 'cloudfront.net'];
  if (parsed.protocol !== 'https:' || !allowed.some((domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`))) {
    throw new Error('Twitch returned an unexpected clip-download host.');
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: 'error' });
  if (!response.ok || !response.body) throw new Error('Could not download the test clip.');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 50 * 1024 * 1024) throw new Error('The test clip exceeded the download limit.');
      chunks.push(next.value);
    }
  } finally { await reader.cancel(); }
  await writeFile(path, Buffer.concat(chunks));
}

function correlation(a: Buffer, b: Buffer, offset: number): number {
  let sumA = 0, sumB = 0, aa = 0, bb = 0, ab = 0;
  for (let index = 0; index < pixels; index++) {
    const x = a[index] ?? 0;
    const y = b[offset + index] ?? 0;
    sumA += x; sumB += y; aa += x * x; bb += y * y; ab += x * y;
  }
  const covariance = ab - sumA * sumB / pixels;
  const scale = Math.sqrt((aa - sumA * sumA / pixels) * (bb - sumB * sumB / pixels));
  return scale > 0 ? covariance / scale : 0;
}

export async function alignRecordedProbe(report: ProbeReport, tokens: TwitchTokens) {
  const broadcast = testBroadcastSchema.parse(JSON.parse(await readFile('data/test-stream/broadcast.json', 'utf8')));
  if (broadcast.stream_id !== report.stream_id || broadcast.source_wall_start_ms === undefined) {
    throw new Error('The recording manifest does not match this probe.');
  }
  const helix = new TwitchHelix(tokens);
  let clipId = report.alignment_clip_id ?? (report.vod_clip_playable ? report.vod_clip_id : report.live_clip_id);
  if (!clipId) throw new Error('The recording needs a created test clip for alignment.');
  let clip = await helix.clip(clipId);
  let knownStart = report.alignment_clip_start_s;
  if (clip?.vod_offset == null && knownStart === undefined && report.vod_id) {
    const stream = await helix.requireStream(report.stream_id);
    clipId = await helix.createVodProbeClip(stream, report.vod_id, 90);
    report.alignment_clip_id = clipId;
    report.alignment_clip_start_s = 60;
    knownStart = 60;
    await writeFile(join('data/probe', report.run, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
    clip = await helix.clip(clipId);
  }
  const deadline = Date.now() + 60_000;
  while ((!clip || (clip.vod_offset === null && knownStart === undefined)) && Date.now() < deadline) {
    await delay(2000);
    clip = await helix.clip(clipId);
  }
  if (!clip || (clip.vod_offset === null && knownStart === undefined) || clip.broadcaster_id !== report.broadcaster_id) {
    throw new Error('Wait for Twitch to associate the clip with its VOD, then finalize again.');
  }
  if (report.vod_id && clip.video_id && report.vod_id !== clip.video_id) throw new Error('The clip belongs to a different VOD.');
  if (clip.video_id) report.vod_id = clip.video_id;
  const query = new URLSearchParams({ editor_id: report.broadcaster_id, broadcaster_id: report.broadcaster_id, clip_id: clipId });
  const downloads = await helix.request('broadcaster', 'GET', `/clips/downloads?${query}`, twitchClipDownloadsSchema);
  const url = downloads.data.find((entry) => entry.clip_id === clipId)?.landscape_download_url;
  if (!url) throw new Error('Twitch has not made the test clip downloadable yet.');
  const path = join('data/probe', report.run, 'alignment-clip.mp4');
  await boundedDownload(url, path);
  const sampleOffset = Math.min(5, clip.duration / 2);
  const observed = (clip.vod_offset ?? knownStart ?? 0) + sampleOffset;
  const baseline = (broadcast.source_wall_start_ms - Date.parse(report.stream_started_at)) / 1000;
  const start = Math.max(0, observed - baseline - 20);
  const target = await run('ffmpeg.exe', ['-hide_banner', '-loglevel', 'error', '-ss', String(sampleOffset), '-i', path,
    '-vf', frameFilter, '-frames:v', '1', '-f', 'rawvideo', 'pipe:1'], { encoding: 'buffer', windowsHide: true });
  const source = await run('ffmpeg.exe', ['-hide_banner', '-loglevel', 'error', '-ss', String(start), '-i', 'data/test-stream/recording.mp4',
    '-t', '40', '-vf', `fps=10,${frameFilter}`, '-f', 'rawvideo', 'pipe:1'],
  { encoding: 'buffer', windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  if (target.stdout.length !== pixels || source.stdout.length < pixels * 2) throw new Error('The downloaded clip did not decode into usable video frames.');
  let best = -1;
  let bestFrame = -1;
  let runnerUp = -1;
  const scores: number[] = [];
  for (let frame = 0; frame < Math.floor(source.stdout.length / pixels); frame++) {
    const score = correlation(target.stdout, source.stdout, frame * pixels);
    scores.push(score);
    if (score > best) { best = score; bestFrame = frame; }
  }
  for (const [frame, score] of scores.entries()) if (Math.abs(frame - bestFrame) >= 10) runnerUp = Math.max(runnerUp, score);
  if (bestFrame < 0 || best < 0.9 || best - runnerUp < 0.002) throw new Error('The clip timecode match was ambiguous. Keep alignment unconfirmed and inspect the clip.');
  const alignment = {
    source_wall_start_ms: broadcast.source_wall_start_ms,
    source_offset_s: start + bestFrame / 10,
    observed_vod_offset_s: observed,
    method: 'video_timecode_match' as const
  };
  await writeFile(join('data/probe', report.run, 'alignment.json'), JSON.stringify({ ...alignment, correlation: best, distinctAlternative: runnerUp }, null, 2));
  return alignment;
}

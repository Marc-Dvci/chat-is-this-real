import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { ModelClient } from '../src/llm/client.js';
import { loadModelConfig } from '../src/llm/config.js';
import { probeReportSchema, testBroadcastSchema, transcriptSegmentSchema, type TranscriptSegment } from '../src/shared/schemas.js';

const execute = promisify(execFile);

function rms(wav: Buffer): number {
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Invalid WAV input.');
  let start = 12;
  while (start + 8 <= wav.length) {
    const size = wav.readUInt32LE(start + 4);
    if (wav.toString('ascii', start, start + 4) === 'data') {
      const end = Math.min(start + 8 + size, wav.length);
      let squares = 0, count = 0;
      for (let offset = start + 8; offset + 1 < end; offset += 2) { squares += wav.readInt16LE(offset) ** 2; count++; }
      return count ? Math.sqrt(squares / count) : 0;
    }
    start += 8 + size + size % 2;
  }
  throw new Error('Missing WAV samples.');
}

async function record(): Promise<void> {
  if (process.env.LIVE !== '1') throw new Error('Set LIVE=1 to transcribe using the authorized model allowance.');
  try { await readFile('eval/LOCK.md'); throw new Error('The evaluation is locked. Create new retired/replacement items instead.'); }
  catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
  const broadcast = testBroadcastSchema.parse(JSON.parse(await readFile('data/test-stream/broadcast.json', 'utf8')));
  const probe = probeReportSchema.parse(JSON.parse(await readFile('data/probe/1792830555944/report.json', 'utf8')));
  if (!broadcast.source_wall_start_ms || !broadcast.stream_started_at || !broadcast.stream_id || !probe.vod_id || probe.correction_s === undefined) {
    throw new Error('Missing measured stream alignment.');
  }
  const alignment = (broadcast.source_wall_start_ms - Date.parse(broadcast.stream_started_at)) / 1000 + probe.correction_s;
  const chunkDirectory = 'data/eval-transcript/chunks';
  await mkdir(chunkDirectory, { recursive: true, mode: 0o700 });
  await mkdir('eval/vod', { recursive: true });
  await execute('ffmpeg.exe', ['-hide_banner', '-loglevel', 'error', '-y', '-i', 'data/test-stream/recording.wav',
    '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', '-f', 'segment', '-segment_time', '15', '-reset_timestamps', '1', join(chunkDirectory, '%03d.wav')], { windowsHide: true });
  const model = new ModelClient(loadModelConfig(), 'data/eval-transcript/wire');
  const segments: TranscriptSegment[] = [];
  const chunks: { index: number; sha256: string; silence: boolean }[] = [];
  let previous = '';
  try {
    for (const file of (await readdir(chunkDirectory)).filter((file) => /^\d{3}\.wav$/u.test(file)).sort()) {
      const index = Number(file.slice(0, 3));
      const path = join(chunkDirectory, file);
      const wav = await readFile(path);
      const silence = rms(wav) < 20;
      chunks.push({ index, sha256: createHash('sha256').update(wav).digest('hex'), silence });
      if (silence) { previous = ''; await unlink(path); continue; }
      const transcript = await model.asr(wav, previous);
      if (!transcript.text.trim()) throw new Error('A speech chunk returned no text.');
      if (transcript.words.some((word) => word.end_time < word.begin_time || word.end_time > 15_200)) throw new Error('Invalid chunk word timings.');
      const rawOffset = index * 15 + alignment;
      const clippedMs = Math.max(0, -rawOffset * 1000);
      const words = transcript.words.filter((word) => word.begin_time >= clippedMs)
        .map((word) => ({ ...word, begin_time: word.begin_time - clippedMs, end_time: word.end_time - clippedMs }));
      const text = clippedMs ? words.map((word) => `${word.text.trim()}${word.punctuation?.trim() ?? ''}`).join(' ').replace(/\s+/gu, ' ').trim() : transcript.text.trim();
      segments.push(transcriptSegmentSchema.parse({
        id: `segment-${file.slice(0, 3)}`, broadcast_id: broadcast.stream_id, vod_id: probe.vod_id,
        offset_s: Math.max(0, rawOffset), duration_s: 15 - clippedMs / 1000,
        text, words, source: 'live', created_at: new Date().toISOString()
      }));
      previous = transcript.text;
      console.info(`Transcribed source chunk ${index}; ${transcript.words.length} timed words.`);
      await unlink(path);
    }
    await writeFile('eval/vod/transcript.jsonl', segments.map((segment) => JSON.stringify(segment)).join('\n') + '\n');
    await writeFile('eval/vod/source.json', JSON.stringify({
      source: 'Original system narration used in the actual prerecorded Twitch test stream.',
      broadcast_id: broadcast.stream_id, vod_id: probe.vod_id, source_duration_s: broadcast.source_seconds,
      alignment_s: alignment, alignment_method: 'M1 decoded timecode match', speech_source: 'system narration',
      model: model.config.MODEL_ASR, chunks, transcribed_segments: segments.length,
      calls: model.calls, human_voice_validation: false, paid_search_calls: 0
    }, null, 2));
  } finally {
    await writeFile('data/eval-transcript/progress.json', JSON.stringify({ segments, chunks, calls: model.calls }, null, 2), { mode: 0o600 });
  }
}

void record().catch(() => { console.error('Evaluation transcription stopped. Inspect private progress and alignment before resuming.'); process.exitCode = 1; });

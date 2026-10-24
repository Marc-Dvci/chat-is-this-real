import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, unlink, rmdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ModelClient } from '../llm/client.js';
import { loadModelConfig } from '../llm/config.js';
import { mediaImportSchema, mediaInfoSchema, type MediaImport, type TranscriptSegment, type twitchVideoSchema } from '../shared/schemas.js';
import type { z } from 'zod';
import type { SegmentStore } from '../store/segment-store.js';
import { transaction } from '../store/database.js';
import { ffmpegBinary, ffprobeBinary, mediaInputOptions, transcribeAudio } from './audio.js';

const execute = promisify(execFile);
export class MediaImports {
  private active: { abort: AbortController; done: Promise<void> } | undefined;
  private receiving = false;
  constructor(private readonly segments: SegmentStore) {
    segments.db.exec('CREATE TABLE IF NOT EXISTS media_imports (id TEXT PRIMARY KEY,data_json TEXT NOT NULL) STRICT;');
    for (const item of this.list()) if (!['ready', 'failed'].includes(item.state)) this.save({ ...item, state: 'failed', reason: 'interrupted' });
  }
  busy(): boolean { return this.receiving || Boolean(this.active); }
  list(): MediaImport[] { return this.segments.db.prepare('SELECT data_json FROM media_imports ORDER BY rowid DESC LIMIT 100').all().map((row) => mediaImportSchema.parse(JSON.parse(String(row.data_json)))); }
  private save(item: MediaImport): void {
    this.segments.db.prepare('INSERT INTO media_imports VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json').run(item.id, JSON.stringify(mediaImportSchema.parse(item)));
  }
  async receive(video: z.infer<typeof twitchVideoSchema>, input: Readable): Promise<MediaImport> {
    if (this.busy()) throw new Error('Wait for the current media import.');
    this.receiving = true;
    const item: MediaImport = { id: randomUUID(), vod_id: video.id, state: 'receiving', progress_s: 0, total_s: null, reason: null, created_at: new Date().toISOString() };
    this.save(item);
    let directory: string | undefined;
    let size = 0;
    try {
      await mkdir('data/media', { recursive: true, mode: 0o700 });
      directory = await mkdtemp(resolve('data/media/import-'));
      const path = join(directory, 'input-media');
      await pipeline(input, new Transform({ transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length; callback(size > 2_147_483_648 ? new Error('Media exceeds the 2 GB limit.') : null, chunk);
      } }), createWriteStream(path, { flags: 'wx', mode: 0o600 }));
      if (!size) throw new Error('The media file is empty.');
      const abort = new AbortController();
      const done = this.process(video, item, directory, abort.signal).catch(() => {
        this.save({ ...item, state: 'failed', reason: 'media_or_allowance' });
      }).finally(async () => {
        try { await this.cleanup(directory!); }
        catch { this.save({ ...item, state: 'failed', reason: 'cleanup_failed' }); }
        this.active = undefined;
      });
      this.active = { abort, done };
      return item;
    } catch (error) { this.save({ ...item, state: 'failed', reason: 'upload_failed' }); if (directory) await this.cleanup(directory); throw error; }
    finally { this.receiving = false; }
  }
  private async process(video: z.infer<typeof twitchVideoSchema>, item: MediaImport, directory: string, signal: AbortSignal): Promise<void> {
    const path = join(directory, 'input-media');
    const probe = await execute(ffprobeBinary, ['-v', 'error', ...mediaInputOptions, '-show_entries', 'format=duration', '-of', 'json', path], { signal, timeout: 15_000, windowsHide: true, maxBuffer: 1_048_576 });
    item.total_s = mediaInfoSchema.parse(JSON.parse(probe.stdout)).format.duration;
    item.state = 'transcribing'; this.save(item);
    await execute(ffmpegBinary, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...mediaInputOptions, '-i', path,
      '-vn', '-threads', '2', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', '-f', 'segment', '-segment_time', '15',
      '-reset_timestamps', '1', join(directory, 'chunk-%06d.wav')], { signal, timeout: 600_000, windowsHide: true, maxBuffer: 1_048_576 });
    const model = new ModelClient(loadModelConfig()), id = `upload-${video.id}`, captured: TranscriptSegment[] = [];
    let previous = '';
    for (const file of (await readdir(directory)).filter((file) => /^chunk-\d{6}\.wav$/u.test(file)).sort()) {
      signal.throwIfAborted();
      const index = Number(file.slice(6, 12)), chunkPath = join(directory, file);
      try {
        const result = await transcribeAudio(model, await readFile(chunkPath), previous, {}, signal);
        previous = result.text;
        if (result.text.trim()) captured.push({ id: `${id}-${item.id}-${index}`, broadcast_id: id, vod_id: video.id,
          offset_s: index * 15, duration_s: result.duration, text: result.text, words: result.words, source: 'upload', created_at: item.created_at });
        item.progress_s = Math.min(item.total_s, index * 15 + result.duration); this.save(item);
      } finally { await unlink(chunkPath); }
    }
    signal.throwIfAborted();
    transaction(this.segments.db, () => {
      this.segments.remove(id);
      this.segments.register({ id, vod_id: video.id, title: video.title, started_at: video.created_at, source: 'upload', created_at: item.created_at });
      for (const segment of captured) this.segments.put(segment);
      this.segments.cover(id, 0, item.total_s!);
    });
    item.state = 'ready'; item.progress_s = item.total_s; this.save(item);
  }
  private async cleanup(directory: string): Promise<void> {
    for (const file of await readdir(directory)) if (file === 'input-media' || /^chunk-\d{6}\.wav$/u.test(file)) await unlink(join(directory, file));
    await rmdir(directory);
  }
  async close(): Promise<void> { this.active?.abort.abort(); await this.active?.done; }
}

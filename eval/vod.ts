import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { ModelClient } from '../src/llm/client.js';
import { loadModelConfig } from '../src/llm/config.js';
import { openDatabase } from '../src/store/database.js';
import { SegmentStore } from '../src/store/segment-store.js';
import { VodEngine } from '../src/vod/engine.js';
import { recordedBroadcastSchema, transcriptSegmentSchema, vodEvaluationQuestionSchema, vodEvaluationSourceSchema, type VodOutcome } from '../src/shared/schemas.js';

const execute = promisify(execFile);
export async function runVod(): Promise<void> {
  if (process.env.LIVE !== '1') throw new Error('Set LIVE=1 to run a live evaluation.');
  const source = vodEvaluationSourceSchema.parse(JSON.parse(await readFile('eval/vod/source.json', 'utf8')));
  const recording = recordedBroadcastSchema.parse(JSON.parse(await readFile('fixtures/vod/recording.json', 'utf8')));
  if (source.broadcast_id !== recording.broadcast_id || source.vod_id !== recording.vod_id) throw new Error('The recorded broadcast does not match the locked corpus.');
  const questions = (await readFile('eval/vod/questions.jsonl', 'utf8')).trim().split('\n').map((line) => vodEvaluationQuestionSchema.parse(JSON.parse(line)));
  const db = openDatabase(':memory:'), store = new SegmentStore(db);
  store.register({ id: source.broadcast_id, vod_id: source.vod_id, title: 'Recorded development stream',
    source: 'live', started_at: recording.stream_started_at, created_at: recording.stream_started_at });
  for (const line of (await readFile('eval/vod/transcript.jsonl', 'utf8')).trim().split('\n')) store.put(transcriptSegmentSchema.parse(JSON.parse(line)));
  store.cover(source.broadcast_id, 0, source.source_duration_s + source.alignment_s);
  const run = new Date().toISOString().replace(/[:.]/gu, '-');
  const model = new ModelClient(loadModelConfig(), `data/eval-vod/${run}/wire`), engine = new VodEngine(model, store);
  const rows: { id: string; expected: string; hit: boolean; output: VodOutcome }[] = [];
  const commit = (await execute('git', ['rev-parse', 'HEAD'])).stdout.trim();
  const dirty = Boolean((await execute('git', ['status', '--porcelain'])).stdout.trim());
  try {
    for (const item of questions) {
      const output = await engine.run(randomUUID(), item.question, source.broadcast_id, { past: false });
      const hit = item.expected === 'not_found' ? !output.found && !output.failed : output.found && output.offset_s !== null &&
        item.offset_min_s !== null && item.offset_max_s !== null && output.offset_s >= item.offset_min_s - 15 && output.offset_s <= item.offset_max_s + 15;
      rows.push({ id: item.id, expected: item.expected, hit, output });
      console.info(`${item.id}: ${output.failed ? 'failed' : output.found ? `found at ${output.offset_s?.toFixed(2)}s` : 'not_found'}.`);
      if (output.reason === 'quota') break;
    }
  } finally {
    const found = questions.filter((item) => item.expected === 'found'), absent = questions.filter((item) => item.expected === 'not_found');
    await mkdir('eval/results', { recursive: true });
    const path = `eval/results/vod-dev-${run}.json`;
    await writeFile(path, JSON.stringify({ suite: 'vod', split: 'dev', sample_count: questions.length, attempted_items: rows.length,
      created_at: new Date().toISOString(), git_commit: commit, working_tree_dirty: dirty, model: model.config.MODEL_VOD,
      speech_source: 'Original system narration from the actual prerecorded Twitch test. Human voice accuracy is not measured.',
      metrics: { hit_within_15s: { matched: rows.filter((row) => row.expected === 'found' && row.hit).length, total: found.length },
        not_found_correctness: { matched: rows.filter((row) => row.expected === 'not_found' && row.hit).length, total: absent.length },
        failed_items: rows.filter((row) => row.output.failed).length, not_attempted: questions.length - rows.length,
        clip_success: { created: 0, attempted: 0, reason: 'Retrieval evaluation does not create public clips. The live probe measures clipping separately.' } },
      outputs: questions.map((item) => ({ id: item.id, expected: item.expected, expected_window_s: [item.offset_min_s, item.offset_max_s],
        output: rows.find((row) => row.id === item.id)?.output ?? null, hit: rows.find((row) => row.id === item.id)?.hit ?? false }))
    }, null, 2));
    console.info(`Saved ${rows.length}/${questions.length} VOD attempts to ${path}.`);
    db.close();
    if (rows.length !== questions.length) process.exitCode = 1;
  }
}

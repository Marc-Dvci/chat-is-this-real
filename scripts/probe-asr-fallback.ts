import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { ModelClient } from '../src/llm/client.js';
import { loadModelConfig } from '../src/llm/config.js';
import { wavInfo } from '../src/vod/audio.js';
import { assertNoSecretFragments } from '../src/shared/format-chat.js';
import { loadedSecrets } from '../src/shared/secrets.js';

async function probe(): Promise<void> {
  if (process.env.LIVE !== '1' || !process.argv.includes('--live')) throw new Error('Use LIVE=1 and --live.');
  const run = new Date().toISOString().replace(/[:.]/gu, '-'), directory = `data/probe-asr-fallback/${run}/wire`;
  const wav = await readFile('data/test-stream/speech-2.wav'), info = wavInfo(wav);
  if (info.duration > 16) throw new Error('Use the original short scripted recording.');
  const model = new ModelClient(loadModelConfig(), directory), rows: { repetition: number; text: string; word_times_available: boolean }[] = [];
  const commit = (await promisify(execFile)('git', ['rev-parse', 'HEAD'])).stdout.trim();
  try {
    for (let repetition = 1; repetition <= 3; repetition++) {
      const result = await model.fallbackAsr(wav);
      rows.push({ repetition, text: result.text, word_times_available: result.words.length > 0 });
      console.info(`Fallback speech trial ${repetition} returned text with approximate timing.`);
    }
    const wire = (await readdir(directory)).filter((file) => file.endsWith('.json')).sort()[0];
    if (!wire) throw new Error('Missing actual fallback response.');
    const capture: { response: unknown } = JSON.parse(await readFile(`${directory}/${wire}`, 'utf8'));
    const fixture = JSON.stringify({ recorded_at: new Date().toISOString(), source: 'Original prerecorded blue robot narration. No human voice.', response: capture.response }, null, 2);
    assertNoSecretFragments(fixture, loadedSecrets());
    await writeFile('fixtures/models/fallback-asr.json', fixture);
  } finally {
    await mkdir('eval/results', { recursive: true });
    await writeFile(`eval/results/asr-fallback-${run}.json`, JSON.stringify({ suite: 'asr-fallback', split: 'recorded-audio-probe',
      git_commit: commit, created_at: new Date().toISOString(), unique_recordings: 1, planned_repetitions: 3,
      source: 'Original system narration, not human speech.', wav_sha256: createHash('sha256').update(wav).digest('hex'),
      duration_s: info.duration, model: model.config.MODEL_ASR_FALLBACK, rows, calls: model.calls }, null, 2));
  }
}
void probe().catch(() => { console.error('Fallback speech probe stopped. Check its saved observations and local allowance.'); process.exitCode = 1; });

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CheckEngine } from '../src/check/engine.js';
import { ModelClient } from '../src/llm/client.js';
import { loadModelConfig } from '../src/llm/config.js';
import { engineConfigSchema, evaluationClaimSchema, sourceSummarySchema } from '../src/shared/schemas.js';
import { claimMetrics, type ClaimMeasurement } from './metrics.js';

const execute = promisify(execFile);
export async function runClaims(split: 'dev' | 'heldout'): Promise<void> {
  if (process.env.LIVE !== '1') throw new Error('Set LIVE=1 to run a live evaluation.');
  if (split === 'heldout' && process.env.ALLOW_HELDOUT_RUN !== '1') throw new Error('Heldout evaluation is reserved for M11.');
  const run = new Date().toISOString().replace(/[:.]/gu, '-');
  const path = `eval/results/claims-${split}-${run}.json`;
  const items = (await readFile('eval/claims.jsonl', 'utf8')).trim().split('\n').flatMap((line) => {
    const raw: unknown = JSON.parse(line);
    return raw && typeof raw === 'object' && 'split' in raw && raw.split === split ? [evaluationClaimSchema.parse(raw)] : [];
  });
  const config = loadModelConfig();
  const mode = engineConfigSchema.parse(process.env).SEARCH_MODE;
  if (mode === 'replay') process.env.SEARCH_REPLAY_PATH = `fixtures/search/${split}.json`;
  const model = new ModelClient(config, `data/eval-claims/${split}-${run}/wire`);
  const engine = new CheckEngine(model);
  const rows: ClaimMeasurement[] = [];
  const commit = (await execute('git', ['rev-parse', 'HEAD'])).stdout.trim();
  const dirty = Boolean((await execute('git', ['status', '--porcelain'])).stdout.trim());
  if (split === 'heldout') await writeFile('eval/heldout-run.json', JSON.stringify({ run, path, started_at: new Date().toISOString() }), { flag: 'wx' });
  try {
    for (const item of items) {
      const output = await engine.run({ id: randomUUID(), claim: item.message, context: [],
        channel: { title: 'Recorded development test', category: 'Just Chatting', language: 'en' } }, { skipCache: true });
      rows.push({ item, output });
      console.info(`${item.id}: ${output.final_verdict}${output.reason ? ` (${output.reason})` : ''}.`);
      if (output.reason === 'quota') break;
    }
  } finally {
    await mkdir('eval/results', { recursive: true });
    const metrics = claimMetrics(rows, items);
    await writeFile(path, JSON.stringify({ suite: 'claims', split, sample_count: items.length, attempted_items: rows.length,
      created_at: new Date().toISOString(), git_commit: commit, working_tree_dirty: dirty,
      models: { triage: config.MODEL_TRIAGE, search: config.MODEL_SEARCH, judge: config.MODEL_JUDGE }, retrieval_mode: mode,
      source_selection: mode === 'replay' ? 'Curated assistant search URLs. Discovery is simulated; recorded rendered captures are labelled in source metadata.' : 'Provider search',
      metrics, outputs: items.map((item) => {
        const output = rows.find((row) => row.item.id === item.id)?.output;
        return { id: item.id, category: item.category, expected_kind: item.expected_kind,
          expected_verdict: item.expected_verdict, status: output ? 'attempted' : 'not_attempted',
          output: output ? { ...output, sources: output.sources.map((source) => sourceSummarySchema.parse(source)) } : null };
      })
    }, null, 2));
    console.info(`Saved ${rows.length}/${items.length} attempted ${split} claims to ${path}.`);
    console.info(JSON.stringify(metrics, null, 2));
    if (rows.length !== items.length) process.exitCode = 1;
  }
}

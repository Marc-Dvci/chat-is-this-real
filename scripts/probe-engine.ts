import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CheckEngine } from '../src/check/engine.js';
import { ModelClient } from '../src/llm/client.js';
import { loadModelConfig } from '../src/llm/config.js';
import { engineConfigSchema, evaluationClaimSchema, sourceSummarySchema, type CheckOutcome } from '../src/shared/schemas.js';
import { verifyEvaluationLock } from '../eval/lock.js';

const execute = promisify(execFile);
async function probe(): Promise<void> {
  if (process.env.LIVE !== '1' || !process.argv.includes('--live')) throw new Error('Live inference requires LIVE=1 and --live.');
  await verifyEvaluationLock();
  process.env.SEARCH_MODE = 'replay';
  process.env.SEARCH_REPLAY_PATH = 'fixtures/search/dev.json';
  const wanted = new Set(['claim-003', 'claim-005', 'claim-009', 'claim-019', 'claim-029']);
  const samples = (await readFile('eval/claims.jsonl', 'utf8')).trim().split('\n').flatMap((line) => {
    const item: unknown = JSON.parse(line);
    if (!item || typeof item !== 'object' || !('split' in item) || item.split !== 'dev') return [];
    const parsed = evaluationClaimSchema.parse(item); return wanted.has(parsed.id) ? [parsed] : [];
  });
  if (samples.length !== 5) throw new Error('Missing fixed dev probe items.');
  const run = new Date().toISOString().replace(/[:.]/gu, '-');
  const model = new ModelClient(loadModelConfig(), `data/probe-engine/${run}/wire`);
  const engine = new CheckEngine(model);
  const rows: { item_id: string; repetition: number; expected: string; output: Omit<CheckOutcome, 'sources'> & { sources: Omit<CheckOutcome['sources'][number], 'text'>[] } }[] = [];
  const commit = (await execute('git', ['rev-parse', 'HEAD'])).stdout.trim();
  const dirty = Boolean((await execute('git', ['status', '--porcelain'])).stdout.trim());
  try {
    for (let repetition = 1; repetition <= 3; repetition++) for (const sample of samples) {
      const outcome = await engine.run({ id: randomUUID(), claim: sample.message, context: [],
        channel: { title: 'Recorded development test', category: 'Just Chatting', language: 'en' } }, { skipCache: true });
      rows.push({ item_id: sample.id, repetition, expected: sample.expected_verdict,
        output: { ...outcome, sources: outcome.sources.map((source) => sourceSummarySchema.parse(source)) } });
      console.info(`Trial ${repetition}: ${sample.id} ended ${outcome.final_verdict}; ${outcome.evidence.length} verified excerpts.`);
      if (outcome.reason === 'quota') throw new Error('Stop after a quota refusal.');
    }
  } finally {
    await mkdir('eval/results', { recursive: true });
    await writeFile(`eval/results/engine-probe-${run}.json`, JSON.stringify({ suite: 'engine-probe', split: 'dev-probe',
      sample_count: rows.length, unique_items: samples.length, planned_repetitions: 3, git_commit: commit, working_tree_dirty: dirty,
      created_at: new Date().toISOString(), retrieval_mode: engineConfigSchema.parse(process.env).SEARCH_MODE,
      source_selection: 'Curated assistant search replay. Provider discovery is simulated; fetching and inference are live.', rows }, null, 2));
  }
}

void probe().catch(() => { console.error('Engine probe stopped. Inspect its saved report and private wire records.'); process.exitCode = 1; });

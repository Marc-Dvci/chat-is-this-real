import { readFile, readdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { modelProbeMeasurementsSchema } from '../src/shared/schemas.js';

const execute = promisify(execFile);

function percentile(values: readonly number[], fraction: number): string {
  if (!values.length) return 'not measured';
  const sorted = [...values].sort((left, right) => left - right);
  return `${((sorted[Math.ceil(sorted.length * fraction) - 1] ?? 0) / 1000).toFixed(2)} s`;
}

async function report(): Promise<void> {
  const commit = process.argv[2] ?? (await execute('git', ['rev-parse', 'HEAD'])).stdout.trim();
  const runs = [];
  for (const file of (await readdir('eval/results')).filter((file) => /^models-probe-.*\.json$/u.test(file))) {
    const run = modelProbeMeasurementsSchema.parse(JSON.parse(await readFile(`eval/results/${file}`, 'utf8')));
    if (run.git_commit === commit) runs.push({ ...run, file });
  }
  if (!runs.length) throw new Error('No recorded model probes match the requested commit.');
  const rows = runs.flatMap((run) => run.rows);
  const calls = runs.flatMap((run) => run.calls);
  const roles = ['triage', 'judge', 'vod', 'asr'] as const;
  const lines = [
    '# Model probe measurements', '',
    `These probe results come from ${runs.length} runs at commit \`${commit}\`.`,
    'They are separate from the locked dev and heldout evaluations. Earlier diagnostic runs remain in `eval/results/`.', '',
    'Endpoint: `' + runs[0]?.endpoint + '` (Singapore).',
    runs.every((run) => run.search_mode === 'reference')
      ? 'Sources came from known reference URLs. Search discovery and end-to-end latency are not measured.'
      : runs.every((run) => run.search_mode === 'replay')
        ? 'Search discovery is simulated using recorded assistant search URLs. Fetching and model inference are live; provider search is not measured.'
        : 'The linked reports identify whether each run used reference URLs, replay or provider search.', '',
    '| Role | Model | Completed / attempted | Task result | p50 | p90 |', '|---|---|---|---|---|---|'
  ];
  for (const role of roles) {
    for (const model of new Set(rows.filter((row) => row.role === role).map((row) => row.model))) {
      const attempted = rows.filter((row) => row.role === role && row.model === model);
      const completed = attempted.filter((row) => row.status === 'ok');
      let outcome = '';
      if (role === 'triage') outcome = `${completed.filter((row) => row.kind === row.expected_kind).length}/${attempted.length} kind matches`;
      if (role === 'judge') outcome = `${completed.filter((row) => row.verdict === row.expected_verdict).length}/${attempted.length} raw proposal matches`;
      if (role === 'vod') outcome = `${completed.filter((row) => row.valid_segment_ids).length}/${attempted.length} expected segment answers`;
      if (role === 'asr') {
        const words = completed.reduce((sum, row) => sum + (row.reference_words ?? 0), 0);
        const errors = completed.reduce((sum, row) => sum + (row.word_errors ?? 0), 0);
        outcome = `${errors}/${words} word errors (plain and context runs combined)`;
      }
      const times = completed.map((row) => row.elapsed_ms);
      lines.push(`| ${role} | \`${model}\` | ${completed.length}/${attempted.length} | ${outcome} | ${percentile(times, 0.5)} | ${percentile(times, 0.9)} |`);
    }
  }
  lines.push('', 'Judge results are model proposals before deterministic verdict rules. They do not measure publishable verdict accuracy.',
    'Speech is original system narration from the prerecorded Twitch test, not human speech. The first context request has no prior transcript.',
    'Word-error calculations ignore case and punctuation; they do not normalize spelled-out numbers to digits.', '',
    '| Judge | Verified / returned excerpts |', '|---|---|');
  for (const model of new Set(rows.filter((row) => row.role === 'judge').map((row) => row.model))) {
    const completed = rows.filter((row) => row.role === 'judge' && row.model === model && row.status === 'ok');
    lines.push(`| \`${model}\` | ${completed.reduce((sum, row) => sum + (row.verified_excerpts ?? 0), 0)}/${completed.reduce((sum, row) => sum + (row.returned_excerpts ?? 0), 0)} |`);
  }
  lines.push('', '| Model | Input tokens | Output tokens | Search tool calls |', '|---|---|---|---|');
  for (const model of new Set(calls.map((call) => call.model))) {
    const measured = calls.filter((call) => call.model === model);
    const sum = (field: 'input_tokens' | 'output_tokens' | 'search_calls') => measured.reduce((total, call) => total + call[field], 0);
    lines.push(`| \`${model}\` | ${sum('input_tokens')} | ${sum('output_tokens')} | ${sum('search_calls')} |`);
  }
  const replayTimes = runs.flatMap((run) => run.replay_latency_ms);
  if (replayTimes.length) lines.push('', `Simulated-search pipeline latency on ${replayTimes.length} probe facts: p50 ${percentile(replayTimes, 0.5)}, p90 ${percentile(replayTimes, 0.9)}.`,
    'This includes classification, replay lookup, live page fetching, judging and excerpt verification. It excludes paid search discovery.');
  lines.push('', 'These are API-reported tokens and tool counts. They do not prove the final billed amount or remaining account quota.',
    'Latency percentiles use nearest rank on successful requests, including provider retries. Errors remain in task denominators.', '',
    'Regenerate this document with `npm run report:models -- <commit>`.', '', 'Source reports:', '',
    ...runs.map((run) => `- [${run.file}](../eval/results/${run.file})`), '');
  await writeFile('docs/models.md', lines.join('\n'));
  console.info('Updated docs/models.md from recorded probe measurements.');
}

void report().catch(() => { console.error('Model report generation failed. Check the run files and commit argument.'); process.exitCode = 1; });

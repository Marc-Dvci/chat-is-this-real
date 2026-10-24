import { readFile, readdir, writeFile } from 'node:fs/promises';
import { claimRunSummarySchema, engineProbeSummarySchema } from '../src/shared/schemas.js';

async function report(): Promise<void> {
  const files = (await readdir('eval/results')).filter((name) => /^claims-dev-.*\.json$/u.test(name)).sort();
  const runs = await Promise.all(files.map(async (file) => ({ file,
    result: claimRunSummarySchema.parse(JSON.parse(await readFile(`eval/results/${file}`, 'utf8'))) })));
  if (!runs.length) throw new Error('Run the dev evaluation first.');
  const seconds = (value: number | null) => value === null ? 'not measured' : `${(value / 1000).toFixed(2)} s`;
  const lines = ['# Check engine measurements', '',
    'These are repeated development runs on a small authored corpus. They do not measure independent topic generalization.',
    'Search discovery is simulated with curated assistant search URLs. Fetching and model inference are live.',
    'A bounded recorded publisher excerpt is used when its live page has no extractable text. Each source records its capture mode.',
    'Paid Model Studio search remains disabled. No heldout labels were used.', '',
    '| Dev run | Judge | Agreement | Reversed verdicts | Verified / returned excerpts | p50 | p90 |',
    '|---|---|---|---|---|---|---|'];
  for (const { file, result } of runs) {
    const m = result.metrics;
    lines.push(`| [${result.git_commit.slice(0, 7)}](../eval/results/${file}) | \`${result.models.judge}\` | ${m.verdict_agreement.matched}/${m.verdict_agreement.total} dev claims | ${m.wrong_direction_errors} | ${m.excerpts.verified}/${m.excerpts.returned} | ${seconds(m.latency_ms.p50)} | ${seconds(m.latency_ms.p90)} |`);
  }
  const latest = runs.at(-1); if (!latest) return;
  const m = latest.result.metrics;
  lines.push('', 'The larger judge is the current default after its dev comparison. The original claim is authoritative; normalized text is a search hint.',
    'Verification now renders excerpts from stored source text. It drops spliced, invented and out-of-bounds passages.', '',
    '| Latest dev category | Matched / all items | Attempted |', '|---|---|---|');
  for (const [category, row] of Object.entries(m.by_category)) lines.push(`| ${category} | ${row.matched}/${row.total} | ${row.attempted} |`);
  lines.push('',
    `Latest dev non-claim precision is ${m.not_a_claim.true_positive}/${m.not_a_claim.predicted}; recall is ${m.not_a_claim.true_positive}/${m.not_a_claim.expected}.`,
    `The ${m.injection_coverage.attempted}/${m.injection_coverage.total} attempted dev injection items produced ${m.injection_directional_errors} directional verdicts.`,
    `The latest run has ${m.failed_items} failed and ${m.not_attempted} unattempted dev items.`, '',
    'Latency includes non-claims and pre-model instruction guards, using nearest-rank percentiles. It excludes paid search discovery.',
    'The linked reports preserve each output, source metadata, model IDs, commit and working-tree status.', '',
    'Missing qualifications remain a limitation. Literal excerpt verification cannot prove that the model assigned the right stance or interpreted the claim correctly.',
    'A streamer must review each result before publication. Sensitive outcomes are tagged for a second confirmation when publishing is connected.', '',
    'The replay path checks only recorded claims. An unknown claim ends as a private search_replay_miss failure; it does not pretend a web search ran.',
    'The local token ledger stops inference before its configured allowance limit. It cannot establish the provider account balance.', '',
    'Regenerate with `npm run report:claims`.');
  const probeFile = (await readdir('eval/results')).filter((file) => /^engine-probe-.*\.json$/u.test(file)).sort().at(-1);
  if (probeFile) {
    const probe = engineProbeSummarySchema.parse(JSON.parse(await readFile(`eval/results/${probeFile}`, 'utf8')));
    lines.push('', `The [fixed engine probe](../eval/results/${probeFile}) recorded ${probe.planned_repetitions} repetitions of ${probe.unique_items} dev claims, with ${probe.rows.filter((row) => row.expected === row.output.final_verdict).length}/${probe.rows.length} matching final verdicts.`,
      `Its working-tree dirty flag is ${probe.working_tree_dirty}; its per-call records identify the actual selected models.`);
  }
  await writeFile('docs/check-engine.md', `${lines.join('\n')}\n`);
}
void report().catch(() => { console.error('Could not generate the check engine report.'); process.exitCode = 1; });

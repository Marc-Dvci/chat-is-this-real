import { readFile, writeFile } from 'node:fs/promises';
import { evaluationClaimSchema, transcriptSegmentSchema, vodEvaluationQuestionSchema } from '../src/shared/schemas.js';
import { normalizeText } from '../src/shared/text-normalize.js';

async function audit(): Promise<void> {
  const lines = async (path: string) => (await readFile(path, 'utf8')).trim().split(/\r?\n/u).map((line) => JSON.parse(line) as unknown);
  const claims = (await lines('eval/claims.jsonl')).map((value) => evaluationClaimSchema.parse(value));
  const segments = (await lines('eval/vod/transcript.jsonl')).map((value) => transcriptSegmentSchema.parse(value));
  const questions = (await lines('eval/vod/questions.jsonl')).map((value) => vodEvaluationQuestionSchema.parse(value));
  const expectedCounts = { gaming: 18, programming: 10, science: 10, time_sensitive: 6, not_claim: 10, injection: 10, missing_context: 8 };
  const counts = Object.fromEntries(Object.keys(expectedCounts).map((category) => [category, claims.filter((claim) => claim.category === category).length]));
  if (claims.length !== 72 || claims.filter((claim) => claim.split === 'dev').length !== 48 ||
      Object.entries(expectedCounts).some(([category, count]) => counts[category] !== count) ||
      new Set(claims.map((claim) => claim.id)).size !== claims.length ||
      new Set(claims.map((claim) => normalizeText(claim.message))).size !== claims.length) throw new Error('Claim counts or identities do not match the plan.');
  for (const claim of claims) {
    const factual = !['not_claim', 'injection'].includes(claim.category);
    if (factual && !(claim.reference_url && claim.reference_excerpt && claim.reference_sha256 && claim.reference_fetched_at)) throw new Error('A factual label lacks a reference.');
    if (!factual && claim.expected_verdict !== 'not_a_claim') throw new Error('A non-factual input has a factual expected verdict.');
  }
  for (const [index, segment] of segments.entries()) {
    if (segment.words.some((word) => word.end_time < word.begin_time || word.end_time > segment.duration_s * 1000 + 200) ||
      (index > 0 && segment.offset_s < (segments[index - 1]?.offset_s ?? 0))) throw new Error('Transcript timing is inconsistent.');
  }
  if (questions.length !== 26 || questions.filter((question) => question.expected === 'found').length !== 20 ||
      new Set(questions.map((question) => question.id)).size !== questions.length) throw new Error('VOD question counts are inconsistent.');
  for (const question of questions) {
    if (question.expected === 'found' && (question.offset_min_s === null || question.offset_max_s === null || question.offset_max_s < question.offset_min_s ||
      !segments.some((segment) => segment.offset_s >= (question.offset_min_s ?? 0) && segment.offset_s <= (question.offset_max_s ?? 0)))) throw new Error('A found question has no recorded segment in its expected window.');
    if (question.expected === 'not_found' && (question.offset_min_s !== null || question.offset_max_s !== null)) throw new Error('A not-found question has a fabricated offset.');
  }
  const reviewCounts = { gaming: 2, programming: 2, science: 2, time_sensitive: 2, not_claim: 2, injection: 2, missing_context: 3 };
  const review = Object.entries(reviewCounts).flatMap(([category, count]) => claims.filter((claim) => claim.split === 'dev' && claim.category === category).slice(0, count));
  await writeFile('docs/EVAL_REVIEW.md', ['# Deferred label review', '',
    'The user deferred manual review until the end of the build. These dev items provide the requested label spot-check. Heldout labels stay outside this document.',
    'Check the assertion, expected result, cited page and qualifying context. A correction must retire the locked ID and create a new item.', '',
    '| ID | Chat input | Expected result | Reference |', '|---|---|---|---|',
    ...review.map((claim) => `| ${claim.id} | ${claim.message.replaceAll('|', '\\|')} | ${claim.expected_verdict} | ${claim.reference_url ? `[source](${claim.reference_url})` : 'Authored non-factual input'} |`), ''].join('\n'));
  const report = { suite: 'ground-truth-integrity', split: 'all', sample_count: claims.length, created_at: new Date().toISOString(),
    claim_counts: counts, dev_items: 48, heldout_items: 24, transcript_segments: segments.length,
    vod_found_questions: 20, vod_not_found_questions: 6, manual_review: 'deferred by user', reference_checks: 'Captured-text matches verified during authorship; not a live engine measurement.' };
  await writeFile('eval/results/ground-truth-integrity.json', JSON.stringify(report, null, 2) + '\n');
  console.info(JSON.stringify(report, null, 2));
}

void audit().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Evaluation data audit failed.'); process.exitCode = 1; });

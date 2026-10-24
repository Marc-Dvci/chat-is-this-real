import { expect, it } from 'vitest';
import { claimMetrics } from '../eval/metrics.js';
import type { CheckOutcome, EvaluationClaim } from '../src/shared/schemas.js';

it('keeps unattempted items in the evaluation denominators', () => {
  const fact: EvaluationClaim = { id: 'claim-901', message: 'A domain test assertion.', category: 'science', expected_kind: 'fact',
    expected_verdict: 'real', reference_url: null, reference_excerpt: null, reference_sha256: null, reference_fetched_at: null, split: 'dev', notes: '' };
  const nonclaim: EvaluationClaim = { ...fact, id: 'claim-902', category: 'injection', expected_kind: 'other', expected_verdict: 'not_a_claim' };
  const output: CheckOutcome = { id: 'domain-test', type: 'fact', normalized_claim: fact.message, triage: null, final_verdict: 'real', model_verdict: 'real',
    explanation: '', sources: [], evidence: [], returned_excerpts: 0, dropped_excerpts: 0, sensitive: false, reason: null,
    created_at: '2026-10-24T00:00:00Z', elapsed_ms: 100, cache_hit: false, retrieval_mode: 'replay', calls: [], failed: false };
  const report = claimMetrics([{ item: fact, output }], [fact, nonclaim]);
  expect(report.verdict_agreement).toEqual({ matched: 1, total: 2, attempted: 1, rate: 0.5 });
  expect(report.not_a_claim).toMatchObject({ expected: 1, recall: 0, precision: null });
  expect(report.injection_coverage).toEqual({ attempted: 0, total: 1 });
  expect(report.not_attempted).toBe(1);
});

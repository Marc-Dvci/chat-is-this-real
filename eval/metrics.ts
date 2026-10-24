import type { CheckOutcome, EvaluationClaim } from '../src/shared/schemas.js';

export type ClaimMeasurement = { item: EvaluationClaim; output: CheckOutcome };
function percentile(values: readonly number[], fraction: number): number | null {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted.length ? sorted[Math.ceil(sorted.length * fraction) - 1] ?? null : null;
}
export function claimMetrics(rows: readonly ClaimMeasurement[], items = rows.map(({ item }) => item)) {
  const matched = rows.filter(({ item, output }) => item.expected_verdict === output.final_verdict).length;
  const truth = items.filter((item) => item.expected_verdict === 'not_a_claim').length;
  const predicted = rows.filter(({ output }) => output.final_verdict === 'not_a_claim').length;
  const truePositive = rows.filter(({ item, output }) => item.expected_verdict === 'not_a_claim' && output.final_verdict === 'not_a_claim').length;
  const returned = rows.reduce((sum, { output }) => sum + output.returned_excerpts, 0);
  const verified = rows.reduce((sum, { output }) => sum + output.evidence.length, 0);
  const times = rows.map(({ output }) => output.elapsed_ms);
  return {
    verdict_agreement: { matched, total: items.length, attempted: rows.length, rate: items.length ? matched / items.length : null },
    by_category: Object.fromEntries([...new Set(items.map((item) => item.category))].map((category) => {
      const selected = rows.filter(({ item }) => item.category === category);
      return [category, { matched: selected.filter(({ item, output }) => item.expected_verdict === output.final_verdict).length, total: items.filter((item) => item.category === category).length, attempted: selected.length }];
    })),
    wrong_direction_errors: rows.filter(({ item, output }) => (item.expected_verdict === 'real' && output.final_verdict === 'not_real') ||
      (item.expected_verdict === 'not_real' && output.final_verdict === 'real')).length,
    not_a_claim: { true_positive: truePositive, predicted, expected: truth, precision: predicted ? truePositive / predicted : null, recall: truth ? truePositive / truth : null },
    injection_directional_errors: rows.filter(({ item, output }) => item.category === 'injection' && ['real', 'not_real'].includes(output.final_verdict)).length,
    injection_coverage: { attempted: rows.filter(({ item }) => item.category === 'injection').length, total: items.filter((item) => item.category === 'injection').length },
    excerpts: { verified, returned, verification_rate: returned ? verified / returned : null },
    latency_ms: { sample_count: times.length, p50: percentile(times, 0.5), p90: percentile(times, 0.9), method: 'nearest_rank', scope: 'All attempted inputs, including non-claims and instruction guards.' },
    failed_items: rows.filter(({ output }) => output.failed).length, not_attempted: items.length - rows.length
  };
}

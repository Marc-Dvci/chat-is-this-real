import type { ModelProbeRow } from '../src/shared/schemas.js';

type Reference = { id: string; expected_verdict: ModelProbeRow['expected_verdict'] };

function percentile(values: readonly number[], fraction: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * fraction) - 1] ?? null;
}

export function summarizeProbe(claims: readonly Reference[], rows: readonly ModelProbeRow[], baselineLatency: readonly number[]) {
  const verdictClaims = claims.filter((claim) => claim.expected_verdict != null);
  const judges = [...new Set(rows.filter((row) => row.role === 'judge').map((row) => row.model))].map((model) => {
    const judgments = rows.filter((row) => row.role === 'judge' && row.model === model);
    const completed = judgments.filter((row) => row.status === 'ok');
    const returned = completed.reduce((sum, row) => sum + (row.returned_excerpts ?? 0), 0);
    const verified = completed.reduce((sum, row) => sum + (row.verified_excerpts ?? 0), 0);
    return {
      model, expected_verdict_items: verdictClaims.length,
      completed_verdict_items: verdictClaims.filter((claim) => completed.some((row) => row.id === claim.id)).length,
      proposal_matches: verdictClaims.filter((claim) => completed.some((row) => row.id === claim.id && row.verdict === claim.expected_verdict)).length,
      skipped: judgments.filter((row) => row.status === 'skipped').length,
      errors: judgments.filter((row) => row.status === 'error').length,
      returned_excerpts: returned, verified_excerpts: verified,
      excerpt_verification_rate: returned ? verified / returned : null
    };
  });
  return {
    judges,
    baseline_latency: { sample_count: baselineLatency.length, percentile_method: 'nearest_rank',
      p50_ms: percentile(baselineLatency, 0.5), p90_ms: percentile(baselineLatency, 0.9) },
    verdict_basis: 'Raw model proposals, before final deterministic verdict rules. Missing results do not count as matches.'
  };
}

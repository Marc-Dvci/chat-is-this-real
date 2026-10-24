import { expect, it } from 'vitest';
import { summarizeProbe } from '../scripts/probe-summary.js';
import type { ModelProbeRow } from '../src/shared/schemas.js';

it('keeps missing judgments in the denominator and excludes skipped results from excerpt totals', () => {
  const claims = [
    { id: 'a', expected_verdict: 'real' as const }, { id: 'b', expected_verdict: 'not_real' as const },
    { id: 'c', expected_verdict: 'real' as const }, { id: 'opinion', expected_verdict: null }
  ];
  const rows: ModelProbeRow[] = [
    { id: 'a', role: 'judge', model: 'candidate', status: 'ok', elapsed_ms: 10, verdict: 'real', returned_excerpts: 3, verified_excerpts: 2 },
    { id: 'b', role: 'judge', model: 'candidate', status: 'skipped', elapsed_ms: 0, skipped_reason: 'no_sources' }
  ];
  expect(summarizeProbe(claims, rows, [30, 10, 20])).toMatchObject({
    judges: [{ expected_verdict_items: 3, completed_verdict_items: 1, proposal_matches: 1, skipped: 1, errors: 0,
      returned_excerpts: 3, verified_excerpts: 2, excerpt_verification_rate: 2 / 3 }],
    baseline_latency: { sample_count: 3, p50_ms: 20, p90_ms: 30 }
  });
});

it('does not report a perfect rate or a zero latency for an empty measurement', () => {
  const rows: ModelProbeRow[] = [{ id: 'a', role: 'judge', model: 'candidate', status: 'error', elapsed_ms: 100, error: 'quota' }];
  expect(summarizeProbe([{ id: 'a', expected_verdict: 'real' }], rows, [])).toMatchObject({
    judges: [{ proposal_matches: 0, errors: 1, excerpt_verification_rate: null }],
    baseline_latency: { sample_count: 0, p50_ms: null, p90_ms: null }
  });
});

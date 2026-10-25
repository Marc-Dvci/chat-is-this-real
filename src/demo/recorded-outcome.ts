import type { DemoCatalog } from '../shared/schemas.js';
import { verifyEvidence } from '../check/verify.js';
import { decideVerdict } from '../check/verdict-rules.js';
import { resolveVodAnswer } from '../vod/answer.js';

export function recordedDemoOutcome(catalog: DemoCatalog, found: DemoCatalog['cases'][number], id: string) {
  const outcome = structuredClone(found.outcome);
  if (outcome.type === 'vod') {
    if (outcome.found) {
      const all = catalog.segments.filter((segment) => segment.broadcast_id === outcome.broadcast_id).sort((left, right) => left.offset_s - right.offset_s);
      const resolved = resolveVodAnswer({ found: true, segment_ids: outcome.segment_ids, relation: outcome.relation, summary: '' }, all, all, found.text);
      if (!resolved) throw new Error('The recorded VOD selection no longer verifies.');
      return { ...outcome, ...resolved, id };
    }
    return { ...outcome, id };
  }
  const verified = verifyEvidence(outcome.evidence, outcome.sources);
  if (verified.dropped) throw new Error('The recorded excerpts no longer verify.');
  return { ...outcome, id, evidence: verified.verified, final_verdict: decideVerdict(outcome.model_verdict, verified.verified) };
}


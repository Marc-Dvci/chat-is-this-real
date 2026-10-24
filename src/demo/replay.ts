import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { demoCatalogSchema, checkOutcomeSchema, type DemoCatalog } from '../shared/schemas.js';
import { normalizeText } from '../shared/text-normalize.js';
import type { CheckReplay } from '../check/service.js';
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

export function loadDemoCatalog(): DemoCatalog {
  return demoCatalogSchema.parse(JSON.parse(readFileSync(new URL('../../fixtures/demo/catalog.json', import.meta.url), 'utf8')));
}
export function demoReplay(catalog: DemoCatalog): CheckReplay {
  return async (job, state, signal) => {
    const found = catalog.cases.find((item) => normalizeText(item.text) === normalizeText(job.input?.claim ?? ''));
    for (const step of ['triage', 'searching', 'reading', 'judging'] as const) { state(step); await delay(200, undefined, { signal }); }
    if (!found) return checkOutcomeSchema.parse({ id: job.id, type: 'fact', normalized_claim: job.input?.claim ?? '', triage: null,
      final_verdict: 'unconfirmed', model_verdict: null, explanation: '', evidence: [], sources: [], returned_excerpts: 0, dropped_excerpts: 0,
      sensitive: false, reason: 'demo_unrecorded', created_at: new Date().toISOString(), elapsed_ms: 800, cache_hit: false, retrieval_mode: 'replay', calls: [], failed: true });
    return recordedDemoOutcome(catalog, found, job.id);
  };
}

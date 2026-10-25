import { checkOutcomeSchema, type DemoCatalog } from '../shared/schemas.js';
import { normalizeText } from '../shared/text-normalize.js';
import type { CheckReplay } from '../check/queue.js';
import { recordedDemoOutcome } from './recorded-outcome.js';
import { abortableDelay } from '../shared/delay.js';

export function demoReplay(catalog: DemoCatalog): CheckReplay {
  return async (job, state, signal) => {
    const found = catalog.cases.find((item) => normalizeText(item.text) === normalizeText(job.input?.claim ?? ''));
    for (const step of ['triage', 'searching', 'reading', 'judging'] as const) { state(step); await abortableDelay(200, signal); }
    if (!found) return checkOutcomeSchema.parse({ id: job.id, type: 'fact', normalized_claim: job.input?.claim ?? '', triage: null,
      final_verdict: 'unconfirmed', model_verdict: null, explanation: '', evidence: [], sources: [], returned_excerpts: 0, dropped_excerpts: 0,
      sensitive: false, reason: 'demo_unrecorded', created_at: new Date().toISOString(), elapsed_ms: 800, cache_hit: false, retrieval_mode: 'replay', calls: [], failed: true });
    return recordedDemoOutcome(catalog, found, job.id);
  };
}

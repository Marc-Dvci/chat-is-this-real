import { sha256Text } from '../shared/sha256.js';
import type { SqliteStore } from '../store/sqlite.js';
import { publicResultSchema, sourceSummarySchema, type CheckJob, type PublicResult } from '../shared/schemas.js';
import { assertNoSecretFragments } from '../shared/format-chat.js';
import { cleanModelExplanation } from '../shared/reply-text.js';
import { loadedSecrets } from '../shared/secrets.js';
import { verifyEvidence } from '../check/verify.js';
import { decideVerdict } from '../check/verdict-rules.js';
import { SegmentStore } from '../store/segment-store.js';
import { resolveVodAnswer } from '../vod/answer.js';
import { normalizeText } from '../shared/text-normalize.js';

export function publicText(text: string): string {
  assertNoSecretFragments(text, loadedSecrets());
  const clean = text.normalize('NFKC').replace(/@[\p{L}\p{N}_-]+/gu, '[viewer]').replace(/\p{Cc}+/gu, ' ').trim();
  assertNoSecretFragments(clean, loadedSecrets()); return clean;
}
export class PublicResults {
  private readonly facts = new Map<string, { updated: string; value: PublicResult }>();
  constructor(private readonly db: SqliteStore) {}
  project(job: CheckJob): PublicResult {
    const outcome = job.outcome;
    if (!outcome || !job.input || outcome.failed || job.reason === 'source_removed' || outcome.type === 'not_a_claim' || outcome.type === 'stream_memory') throw new Error('This check cannot be published.');
    let value: PublicResult;
    if (outcome.type === 'vod') {
      if (outcome.found) {
        const all = new SegmentStore(this.db).all(outcome.broadcast_id ?? '');
        const resolved = resolveVodAnswer({ found: true, segment_ids: outcome.segment_ids, relation: outcome.relation, summary: '' }, all, all, job.input.claim);
        if (!resolved || normalizeText(resolved.quote) !== normalizeText(outcome.quote) || Math.abs(resolved.offset_s - (outcome.offset_s ?? Infinity)) > 0.001) throw new Error('The stored VOD quote no longer verifies.');
      }
      value = publicResultSchema.parse({ ...outcome, claim: publicText(job.input.claim), checked_at: outcome.created_at, quote: publicText(outcome.quote) });
    } else {
      const cached = this.facts.get(job.id);
      if (cached?.updated === job.updated_at) value = cached.value;
      else {
        if (outcome.sources.some((source) => source.sha256 !== sha256Text(source.text))) throw new Error('Stored source text changed.');
        const evidence = verifyEvidence(outcome.evidence, outcome.sources);
        const verdict = decideVerdict(outcome.model_verdict, evidence.verified);
        if (evidence.dropped || verdict !== outcome.final_verdict) throw new Error('The stored evidence no longer verifies.');
        value = publicResultSchema.parse({ id: job.id, type: 'fact', claim: publicText(job.input.claim), verdict,
          explanation: cleanModelExplanation(outcome.explanation), evidence: evidence.verified,
          sources: outcome.sources.map((source) => sourceSummarySchema.parse(source)), checked_at: outcome.created_at, retrieval_mode: outcome.retrieval_mode });
        if (this.facts.size >= 200) this.facts.clear(); this.facts.set(job.id, { updated: job.updated_at, value });
      }
    }
    assertNoSecretFragments(JSON.stringify(value), loadedSecrets()); return value;
  }
}

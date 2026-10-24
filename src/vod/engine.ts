import type { ModelClient } from '../llm/client.js';
import { ModelProviderError } from '../llm/errors.js';
import { vodInstructions } from '../llm/prompts.js';
import { isInstructionAttack } from '../check/input-guards.js';
import { assertNoSecretFragments } from '../shared/format-chat.js';
import { loadedSecrets } from '../shared/secrets.js';
import { clockText } from '../shared/reply-text.js';
import { vodOutcomeSchema, vodProposalSchema, type VodOutcome } from '../shared/schemas.js';
import type { SegmentStore } from '../store/segment-store.js';
import { resolveVodAnswer } from './answer.js';

export class VodEngine {
  constructor(private readonly model: ModelClient, private readonly segments: SegmentStore) {}
  async run(id: string, question: string, currentBroadcast: string | undefined, options: { signal?: AbortSignal; past?: boolean } = {}): Promise<VodOutcome> {
    const started = performance.now(), firstCall = this.model.calls.length;
    const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(45_000)]) : AbortSignal.timeout(45_000);
    const broadcasts = this.segments.broadcasts();
    const ordered = [...broadcasts.filter((broadcast) => broadcast.id === currentBroadcast),
      ...(options.past === false ? [] : broadcasts.filter((broadcast) => broadcast.id !== currentBroadcast))];
    const coverage = ordered.slice(0, 5).map((broadcast) => this.segments.coverage(broadcast.id));
    const finish = (partial: Partial<VodOutcome> = {}): VodOutcome => vodOutcomeSchema.parse({
      id, type: 'vod', found: false, relation: 'not_found', segment_ids: [], quote: '', offset_s: null, end_s: null,
      broadcast_id: null, vod_id: null, broadcast_title: '', broadcast_started_at: null, timing: null, coverage, clip: null,
      reason: null, created_at: new Date().toISOString(), elapsed_ms: performance.now() - started, calls: this.model.calls.slice(firstCall), ...partial
    });
    try {
      assertNoSecretFragments(question, loadedSecrets());
      if (isInstructionAttack(question)) return finish({ reason: 'instruction_attack' });
      if (!coverage.some((item) => item.segment_count > 0)) return finish({ reason: 'no_transcript' });
      // Bound a broad library query so it cannot exhaust the whole allowance in one request.
      for (const broadcast of ordered.slice(0, 5)) {
        signal.throwIfAborted();
        const candidates = this.segments.candidates(broadcast.id, question);
        if (!candidates.length) continue;
        const proposal = await this.model.structured('vod', this.model.config.MODEL_VOD, vodProposalSchema, vodInstructions, {
          question, broadcast: { title: broadcast.title, started_at: broadcast.started_at },
          segments: candidates.map((segment) => ({ id: segment.id, time: clockText(segment.offset_s), text: segment.text }))
        }, signal);
        const resolved = resolveVodAnswer(proposal, candidates, this.segments.all(broadcast.id), question);
        if (resolved) { assertNoSecretFragments(resolved.quote, loadedSecrets()); return finish({ ...resolved, found: true,
          broadcast_title: broadcast.title, broadcast_started_at: broadcast.started_at }); }
      }
      return finish({ reason: ordered.length > 5 ? 'library_limit' : 'not_found' });
    } catch (error) {
      return finish({ reason: signal.aborted ? options.signal?.aborted ? 'cancelled' : 'timeout'
        : error instanceof ModelProviderError ? error.reason === 'quota' ? 'quota' : error.code : 'unsafe_or_invalid', failed: true });
    }
  }
}

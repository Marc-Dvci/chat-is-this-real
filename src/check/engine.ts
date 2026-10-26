import { createHash } from 'node:crypto';
import { ModelProviderError, type ModelClient } from '../llm/client.js';
import { judgeInstructions, triageInstructions } from '../llm/prompts.js';
import { selectSearchSources } from '../llm/search-sources.js';
import { assertNoSecretFragments } from '../shared/format-chat.js';
import { loadedSecrets } from '../shared/secrets.js';
import { cleanModelExplanation } from '../shared/reply-text.js';
import { normalizeText } from '../shared/text-normalize.js';
import { checkInputSchema, checkOutcomeSchema, engineConfigSchema, judgeSchema, triageSchema,
  type CheckInput, type CheckOutcome, type CheckState, type Triage } from '../shared/schemas.js';
import { fetchSource } from './fetch-source.js';
import { isInstructionAttack, needsSensitiveReview } from './input-guards.js';
import { evaluateProposal } from './proposal.js';
import { replaySearch } from './search-replay.js';
import { wikipediaSearch } from './search-wikipedia.js';
import { sourceWindow } from './verify.js';

export type OutcomeCache = { get: (key: string) => CheckOutcome | undefined; put: (key: string, outcome: CheckOutcome) => void };
export class CheckEngine {
  constructor(readonly model: ModelClient, private readonly cache?: OutcomeCache) {}

  async run(input: CheckInput, options: { signal?: AbortSignal; onState?: (state: CheckState) => void; onTriage?: (value: Triage) => void; skipCache?: boolean } = {}): Promise<CheckOutcome> {
    const value = checkInputSchema.parse(input);
    const config = engineConfigSchema.parse(process.env);
    const started = performance.now(), firstCall = this.model.calls.length;
    const deadline = AbortSignal.timeout(45_000);
    const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
    let triage: Triage | null = null;
    let normalized = value.claim;
    const finish = (partial: Partial<CheckOutcome>): CheckOutcome => checkOutcomeSchema.parse({
      id: value.id, type: 'fact', normalized_claim: normalized, triage,
      final_verdict: 'unconfirmed', model_verdict: null, explanation: '', evidence: [], sources: [],
      returned_excerpts: 0, dropped_excerpts: 0, sensitive: needsSensitiveReview(value.claim) || !!triage?.sensitive,
      reason: null, created_at: new Date().toISOString(), elapsed_ms: performance.now() - started,
      cache_hit: false, retrieval_mode: config.SEARCH_MODE, calls: this.model.calls.slice(firstCall), ...partial
    });
    try {
      signal.throwIfAborted();
      assertNoSecretFragments(JSON.stringify(value), loadedSecrets());
      options.onState?.('triage');
      if (isInstructionAttack(value.claim)) {
        options.onState?.('not_a_claim');
        return finish({ type: 'not_a_claim', final_verdict: 'not_a_claim', reason: 'instruction_attack' });
      }
      triage = await this.model.structured('triage', this.model.config.MODEL_TRIAGE, triageSchema, triageInstructions, {
        claim: value.claim, viewer_context_only: value.context, channel: value.channel
      }, signal);
      options.onTriage?.({ ...triage, sensitive: triage.sensitive || needsSensitiveReview(value.claim) });
      normalized = triage.normalized_claim || value.claim;
      if (triage.kind === 'stream_memory') return finish({ type: 'stream_memory', final_verdict: 'not_a_claim', reason: 'route_vod' });
      if (triage.kind !== 'fact') {
        options.onState?.('not_a_claim');
        return finish({ type: 'not_a_claim', final_verdict: 'not_a_claim', reason: triage.kind });
      }
      if (!triage.checkable) { options.onState?.('ready'); return finish({ reason: 'insufficient_context' }); }
      const key = createHash('sha256').update(JSON.stringify([normalizeText(value.claim), normalizeText(normalized),
        value.channel, new Date().toISOString().slice(0, 10), config.SEARCH_MODE, config.SEARCH_REPLAY_PATH])).digest('hex');
      const cached = options.skipCache ? undefined : this.cache?.get(key);
      if (cached && !cached.sensitive && !triage.sensitive && !needsSensitiveReview(value.claim)) {
        options.onState?.('ready');
        return finish({ ...cached, id: value.id, triage, cache_hit: true, elapsed_ms: performance.now() - started,
          calls: this.model.calls.slice(firstCall), created_at: new Date().toISOString() });
      }
      options.onState?.('searching');
      const replay = config.SEARCH_MODE === 'replay' ? await replaySearch(value.claim, config.SEARCH_REPLAY_PATH) : undefined;
      if (replay && !replay.matched) { options.onState?.('failed'); return finish({ reason: 'search_replay_miss', failed: true }); }
      const search = replay ?? (config.SEARCH_MODE === 'wikipedia'
        ? await wikipediaSearch(triage.search_queries.length ? triage.search_queries : [normalized], signal)
        : await this.model.search(this.model.config.MODEL_SEARCH, { original_claim: value.claim, normalized_claim: normalized, queries: triage.search_queries }, signal));
      if (search.searchCalls > 1) throw new ModelProviderError('quota', 'search_budget_limit');
      options.onState?.('reading');
      const selected = selectSearchSources(search.sources);
      const recorded = replay?.documents ?? [];
      const fetched = await Promise.all(selected.map(async (source, index) => {
        const live = await fetchSource(source.url, `${value.id}-source-${index}`, signal);
        const snapshot = !triage?.time_sensitive && recorded.find((document) => document.url === source.url && document.origin === 'recorded_render');
        return live.text || !snapshot ? live : { ...snapshot, id: live.id };
      }));
      signal.throwIfAborted();
      const sources = [...new Map(fetched.filter((source) => source.text && (source.status === 200 || source.origin === 'recorded_render')).map((source) => [source.url, source])).values()];
      if (!sources.length) { options.onState?.('ready'); return finish({ sources: fetched, reason: 'sources_unavailable' }); }
      options.onState?.('judging');
      const proposal = await this.model.structured('judge', this.model.config.MODEL_JUDGE, judgeSchema, judgeInstructions, {
        original_claim: value.claim, normalized_claim: normalized, sources: sources.map((source) => ({ source_id: source.id, url: source.url, tier: source.tier,
          title: source.title, fetched_at: source.fetched_at, capture_mode: source.origin, text: sourceWindow(source.text, [value.claim, normalized, ...triage?.search_queries ?? []]) }))
      }, signal);
      signal.throwIfAborted();
      const decision = evaluateProposal(proposal, sources);
      const clean = cleanModelExplanation(proposal.explanation, loadedSecrets());
      const explanation = decision.final_verdict === proposal.verdict ? clean : decision.final_verdict === 'unconfirmed'
        ? 'The verified excerpts do not establish an answer.' : 'The verdict follows the verified excerpts below.';
      const outcome = finish({ ...decision, sources, explanation });
      if (!options.skipCache && !outcome.sensitive) this.cache?.put(key, outcome);
      options.onState?.('ready');
      return outcome;
    } catch (error) {
      const reason = signal.aborted ? options.signal?.aborted && options.signal.reason?.name !== 'TimeoutError' ? 'cancelled' : 'timeout'
        : error instanceof ModelProviderError ? error.reason === 'quota' ? 'quota' : error.code : 'unsafe_or_invalid';
      options.onState?.('failed');
      return finish({ reason, failed: true });
    }
  }
}

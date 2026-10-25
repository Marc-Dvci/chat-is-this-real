# Final evaluation

The engine was frozen at `c5f6bdc68d0b15d5197e6375772302a8de3fdd06` before the heldout input messages were opened for search curation. [The fingerprint](../eval/FREEZE.json) binds the source, schemas, prompts, dependencies, evaluator and non-secret configuration. The heldout entry point verifies those bytes before reserving its single run.

| Split | Verdict agreement | Reversed verdicts | Verified / returned excerpts | p50 | p90 | Report |
|---|---|---|---|---|---|---|
| dev | 45/48 | 0 | 43/43 | 5.67 s | 7.65 s | [JSON](../eval/results/claims-dev-2026-10-25T09-42-12-643Z.json) |
| heldout | 23/24 | 0 | 19/20 | 5.26 s | 6.02 s | [JSON](../eval/results/claims-heldout-2026-10-25T09-46-52-504Z.json) |

All denominators include every input in the split. Latency uses nearest-rank percentiles across all attempted inputs, including non-claims and pre-model instruction guards. These timings exclude paid search discovery.

Search discovery is simulated with assistant-curated primary-source URLs. Page fetching and Qwen inference are live. Heldout curation used only IDs and input messages, after the freeze, with no expected verdicts or reference URLs. All heldout sources were fetched directly; no fallback answer text was supplied.

The dev split attempted 7/7 injection inputs and returned 0 directional verdicts. Non-claim precision is 14/14; recall is 14/14. Failed inputs: 0.

The heldout split attempted 3/3 injection inputs and returned 0 directional verdicts. Non-claim precision is 6/6; recall is 6/6. Failed inputs: 0.

This is a small authored corpus with related source pages, rather than an independent estimate of accuracy across Twitch. A literal excerpt proves its text was present; it does not prove its stance or the model’s interpretation. Qualification-sensitive claims remain a failure mode.

## Reproduction

Verify the original corpus with `npm run eval:verify`. Verify the frozen engine in the configured local environment with `npm run eval:freeze -- --verify`. The single heldout reservation is [recorded here](../eval/heldout-run.json); it is retained together with every output. Do not delete it or rerun that split.

A separate development run is `LIVE=1 npm run eval -- --suite claims --split dev`. Use the existing free allowance and keep provider search disabled. Earlier development attempts remain in [the complete history](check-engine.md). VOD and speech measurements remain separate in [the VOD report](vod-engine.md) and [model report](models.md).

Regenerate this document and its charts with `npx tsx scripts/report-final.ts`.

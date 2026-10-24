# Runtime model decisions

The configured text defaults remain `qwen3.8-flash` for triage, judging and VOD lookup.
The [candidate comparison](models.md) measures classification, reference-assisted judging
and transcript segment lookup. The smaller triage candidate was faster on the repeated
set but misclassified stream memory in the retained initial diagnostic run. The default
keeps that routing guard. The larger judges did not improve proposal agreement on the
corrected probe. This small repeated set does not establish broader accuracy.

The speech model remains `qwen-audio-3.1-asr-flash`. The real responses contain stored text,
token usage and word timings. Context was tested with original system narration. Human
voice quality is unmeasured because the user selected a prerecorded demonstration.

Strict JSON schema requests succeeded through the Node SDK in Singapore. Wire records show
`enable_thinking: false` at the top level. Invalid structured content is validated locally
and retried once in JSON object mode. The recorded response fixtures cover the observed
chat and native speech envelopes.

On 24 October 2026, the user requested that paid searches stay deferred and search be
simulated using assistant searches. The replay source lists contain primary-page URLs
selected from those searches. Live models judge freshly fetched source text. This replaces
the M2 paid-search acceptance check for this build stage. It does not verify provider search
sources, provider search latency or provider search billing. The search model remains the
planned `qwen3.8-flash` default pending that validation.

Provider search is blocked by default in `ModelClient`, before a network request. Enabling
it requires `MODELSTUDIO_ALLOW_PAID_SEARCH=true` after fee approval. The CLI quota query
requires console authentication; the account's remaining free allowance is user-reported.
No console billing setting was changed.

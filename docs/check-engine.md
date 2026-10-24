# Check engine measurements

These are repeated development runs on a small authored corpus. They do not measure independent topic generalization.
Search discovery is simulated with curated assistant search URLs. Fetching and model inference are live.
A bounded recorded publisher excerpt is used when its live page has no extractable text. Each source records its capture mode.
Paid Model Studio search remains disabled. No heldout labels were used.

| Dev run | Judge | Agreement | Reversed verdicts | Verified / returned excerpts | p50 | p90 |
|---|---|---|---|---|---|---|
| [7ba6bb5](../eval/results/claims-dev-2026-10-24T14-09-43-622Z.json) | `qwen3.8-flash` | 41/48 dev claims | 1 | 41/44 | 5.25 s | 7.83 s |
| [5020c53](../eval/results/claims-dev-2026-10-24T14-17-33-688Z.json) | `qwen3.8-flash` | 42/48 dev claims | 0 | 41/44 | 5.25 s | 7.22 s |
| [4a60657](../eval/results/claims-dev-2026-10-24T14-22-53-508Z.json) | `qwen3.8-max` | 44/48 dev claims | 0 | 40/40 | 5.37 s | 7.07 s |

The larger judge is the current default after its dev comparison. The original claim is authoritative; normalized text is a search hint.
Verification now renders excerpts from stored source text. It drops spliced, invented and out-of-bounds passages.

| Latest dev category | Matched / all items | Attempted |
|---|---|---|
| gaming | 12/12 | 12 |
| programming | 5/6 | 6 |
| science | 6/6 | 6 |
| time_sensitive | 4/4 | 4 |
| not_claim | 7/7 | 7 |
| injection | 7/7 | 7 |
| missing_context | 3/6 | 6 |

Latest dev non-claim precision is 14/14; recall is 14/14.
The 7/7 attempted dev injection items produced 0 directional verdicts.
The latest run has 0 failed and 0 unattempted dev items.

Latency includes non-claims and pre-model instruction guards, using nearest-rank percentiles. It excludes paid search discovery.
The linked reports preserve each output, source metadata, model IDs, commit and working-tree status.

Missing qualifications remain a limitation. Literal excerpt verification cannot prove that the model assigned the right stance or interpreted the claim correctly.
A streamer must review each result before publication. Sensitive checks require a second confirmation in the publishing interface.

The replay path checks only recorded claims. An unknown claim ends as a private search_replay_miss failure; it does not pretend a web search ran.
The local token ledger stops inference before its configured allowance limit. It cannot establish the provider account balance.

Regenerate with `npm run report:claims`.

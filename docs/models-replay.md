# Model probe measurements

These probe results come from 3 runs at commit `e90dd2b322291453204090341918b4839f6416a3`.
They are separate from the locked dev and heldout evaluations. Earlier diagnostic runs remain in `eval/results/`.

Endpoint: `dashscope-intl.aliyuncs.com` (Singapore).
Search discovery is simulated using recorded assistant search URLs. Fetching and model inference are live; provider search is not measured.

| Role | Model | Completed / attempted | Task result | p50 | p90 |
|---|---|---|---|---|---|
| triage | `qwen3.8-flash` | 30/30 | 30/30 kind matches | 2.06 s | 2.96 s |
| judge | `qwen3.8-flash` | 21/21 | 21/21 raw proposal matches | 3.05 s | 3.91 s |
| vod | `qwen3.8-flash` | 9/9 | 9/9 expected segment answers | 1.72 s | 3.63 s |
| asr | `qwen-audio-3.1-asr-flash` | 18/18 | 12/606 word errors (plain and context runs combined) | 1.16 s | 1.68 s |

Judge results are model proposals before deterministic verdict rules. They do not measure publishable verdict accuracy.
Speech is original system narration from the prerecorded Twitch test, not human speech. The first context request has no prior transcript.
Word-error calculations ignore case and punctuation; they do not normalize spelled-out numbers to digits.

| Judge | Verified / returned excerpts |
|---|---|
| `qwen3.8-flash` | 31/34 |

| Model | Input tokens | Output tokens | Search tool calls |
|---|---|---|---|
| `qwen3.8-flash` | 67903 | 6571 | 0 |
| `qwen-audio-3.1-asr-flash` | 3468 | 690 | 0 |

Simulated-search pipeline latency on 21 probe facts: p50 5.98 s, p90 7.33 s.
This includes classification, replay lookup, live page fetching, judging and excerpt verification. It excludes paid search discovery.

These are API-reported tokens and tool counts. They do not prove the final billed amount or remaining account quota.
Latency percentiles use nearest rank on successful requests, including provider retries. Errors remain in task denominators.

Regenerate this document with `npm run report:models -- <commit>`.

Source reports:

- [models-probe-2026-10-24T10-05-41-222Z.json](../eval/results/models-probe-2026-10-24T10-05-41-222Z.json)
- [models-probe-2026-10-24T10-06-43-020Z.json](../eval/results/models-probe-2026-10-24T10-06-43-020Z.json)
- [models-probe-2026-10-24T10-07-51-256Z.json](../eval/results/models-probe-2026-10-24T10-07-51-256Z.json)

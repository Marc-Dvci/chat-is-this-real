# Model probe measurements

These probe results come from 3 runs at commit `2d217c329bec1473451f3b8d851e8dce6539a71d`.
They are separate from the locked dev and heldout evaluations. Earlier diagnostic runs remain in `eval/results/`.

Endpoint: `dashscope-intl.aliyuncs.com` (Singapore).
Sources came from known reference URLs. Search discovery and end-to-end latency are not measured.

| Role | Model | Completed / attempted | Task result | p50 | p90 |
|---|---|---|---|---|---|
| triage | `qwen3.8-flash` | 30/30 | 30/30 kind matches | 2.04 s | 2.57 s |
| triage | `qwen3.7-flash` | 30/30 | 30/30 kind matches | 1.44 s | 1.57 s |
| judge | `qwen3.8-flash` | 21/21 | 21/21 raw proposal matches | 2.32 s | 3.07 s |
| judge | `qwen3.7-plus` | 21/21 | 21/21 raw proposal matches | 3.33 s | 3.63 s |
| judge | `qwen3.8-max` | 21/21 | 21/21 raw proposal matches | 2.79 s | 3.40 s |
| vod | `qwen3.8-flash` | 9/9 | 9/9 expected segment answers | 1.47 s | 2.88 s |
| vod | `qwen3.7-plus` | 9/9 | 9/9 expected segment answers | 2.03 s | 2.43 s |
| asr | `qwen-audio-3.1-asr-flash` | 18/18 | 12/606 word errors (plain and context runs combined) | 1.03 s | 1.59 s |

Judge results are model proposals before deterministic verdict rules. They do not measure publishable verdict accuracy.
Speech is original system narration from the prerecorded Twitch test, not human speech. The first context request has no prior transcript.
Word-error calculations ignore case and punctuation; they do not normalize spelled-out numbers to digits.

| Judge | Verified / returned excerpts |
|---|---|
| `qwen3.8-flash` | 26/27 |
| `qwen3.7-plus` | 18/21 |
| `qwen3.8-max` | 22/22 |

| Model | Input tokens | Output tokens | Search tool calls |
|---|---|---|---|
| `qwen3.8-flash` | 42594 | 5832 | 0 |
| `qwen3.7-flash` | 8220 | 2330 | 0 |
| `qwen3.7-plus` | 34103 | 3030 | 0 |
| `qwen3.8-max` | 31037 | 1715 | 0 |
| `qwen-audio-3.1-asr-flash` | 3468 | 690 | 0 |

These are API-reported tokens and tool counts. They do not prove the final billed amount or remaining account quota.
Latency percentiles use nearest rank on successful requests, including provider retries. Errors remain in task denominators.

Regenerate this document with `npm run report:models -- <commit>`.

Source reports:

- [models-probe-2026-10-24T09-52-47-628Z.json](../eval/results/models-probe-2026-10-24T09-52-47-628Z.json)
- [models-probe-2026-10-24T09-54-49-432Z.json](../eval/results/models-probe-2026-10-24T09-54-49-432Z.json)
- [models-probe-2026-10-24T09-56-52-393Z.json](../eval/results/models-probe-2026-10-24T09-56-52-393Z.json)

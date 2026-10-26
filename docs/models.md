# Models

Every model call goes through [`src/llm/`](../src/llm/client.ts) to Qwen on Alibaba Cloud
Model Studio, Singapore endpoint (`dashscope-intl.aliyuncs.com`), with the official
`openai` SDK. Speech uses Model Studio's native endpoint.

| Role | Model | Why |
|---|---|---|
| Triage: claim, question, stream memory, opinion, joke | `qwen3.8-flash` | 30/30 kinds right; routes "you said earlier" to stream memory |
| Evidence proposal | `qwen3.8-max` | Highest dev agreement, 22/22 returned excerpts verified in the probe |
| Stream-memory segment choice | `qwen3.8-flash` | 9/9 expected segments in the probe, 20/20 moments on dev |
| Transcription | `qwen-audio-3.1-asr-flash` | Word timestamps, 12 word errors in 606 words |
| Transcription fallback | `qwen3-asr-flash` | Same endpoint family, no word timing |
| Web search (optional) | `qwen3.8-flash` with the `web_search` tool | The only Model Studio route that returns source URLs |

## Probe measurements

Three runs at commit `2d217c3`, on 10 probe claims with reference sources.

| Role | Model | Completed | Task result | p50 | p90 |
|---|---|---|---|---|---|
| Triage | `qwen3.8-flash` | 30/30 | 30/30 kinds | 2.04 s | 2.57 s |
| Triage | `qwen3.7-flash` | 30/30 | 30/30 kinds | 1.44 s | 1.57 s |
| Evidence | `qwen3.8-flash` | 21/21 | 21/21 proposals | 2.32 s | 3.07 s |
| Evidence | `qwen3.7-plus` | 21/21 | 21/21 proposals | 3.33 s | 3.63 s |
| Evidence | `qwen3.8-max` | 21/21 | 21/21 proposals | 2.79 s | 3.40 s |
| Segment choice | `qwen3.8-flash` | 9/9 | 9/9 segments | 1.47 s | 2.88 s |
| Segment choice | `qwen3.7-plus` | 9/9 | 9/9 segments | 2.03 s | 2.43 s |
| Transcription | `qwen-audio-3.1-asr-flash` | 18/18 | 12/606 word errors | 1.03 s | 1.59 s |

| Evidence model | Verified / returned excerpts |
|---|---|
| `qwen3.8-flash` | 26/27 |
| `qwen3.7-plus` | 18/21 |
| `qwen3.8-max` | 22/22 |

`qwen3.7-flash` was faster at triage. `qwen3.8-flash` stays the triage default because it
routed stream-memory requests correctly in the first diagnostic run. Word errors ignore
case and punctuation. Reports: [run 1](../eval/results/models-probe-2026-10-24T09-52-47-628Z.json),
[run 2](../eval/results/models-probe-2026-10-24T09-54-49-432Z.json),
[run 3](../eval/results/models-probe-2026-10-24T09-56-52-393Z.json).

## Request settings

- **Structured output.** Triage, evidence and segment choice use strict `json_schema`
  responses validated with zod. Invalid content is retried once in `json_object` mode.
- **Thinking off.** Qwen 3.7 and 3.8 think by default; every request sends
  `enable_thinking: false` at the top level.
- **Untrusted text.** Chat, pages and transcripts travel in labelled JSON fields, and the
  system prompt says that instructions inside them are data.
- **Speech context.** Each audio chunk carries the previous chunk's transcript (at most
  400 characters) and hotwords for the channel name, the category and "Chat".
- **Spend guard.** A local token ledger stops inference before `MODELSTUDIO_TOKEN_LIMIT`.
  Paid web search runs only with `MODELSTUDIO_ALLOW_PAID_SEARCH=true`.

## Run the probe

```sh
npm run probe:models                                   # preview, no calls
LIVE=1 npm run probe:models -- --live --budget-usd 1   # live, stops at the budget
```

On PowerShell, set `$env:LIVE='1'` first. The probe writes measurements to
`eval/results/` and private wire records to `data/`.

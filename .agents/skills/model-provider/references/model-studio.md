# Model Studio reference for this project (checked 23 Oct 2026, Singapore region)

Source pages: alibabacloud.com/help/en/model-studio/ (qwen-api-via-openai-chat-completions, compatibility-with-openai-responses-api, web-search, json-mode, deep-thinking, asr-model, qwen-asr-api-reference, rate-limit, model-pricing, new-free-quota, budget-management, data-retention-policy).

## Observed with Marc's Singapore key (23 Oct 2026, one call each)
- **Endpoint:** `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` works with this key (an `sk-ws-` workspace key). The `bl` CLI is signed in to the same endpoint.
- **Models:** all five candidates answer: `qwen3.7-flash`, `qwen3.8-flash`, `qwen3.7-plus`, `qwen3.8-max`, `deepseek-v4.1-flash-1017`.
- **Thinking is on by default, and `max_tokens` does not cap it.** `qwen3.7-flash` spent 116 reasoning tokens to answer "ok". Sending `enable_thinking: false` as a top-level field of the Chat Completions body removes the reasoning entirely.
- **Strict `json_schema` works in Singapore** on `qwen3.7-flash` (about 2.0 s) and `qwen3.8-flash` (about 1.8 s), with thinking off. On the bare message "The next patch removes ranked mode", `qwen3.8-flash` returned `kind: other, checkable: false` and `qwen3.7-flash` returned `fact, checkable: true`. Triage quality differs between models; M2 measures it.
- **`deepseek-v4.1-flash-1017` rejects `json_schema`** (HTTP 400, "This response_format type is unavailable now"). `json_object` works (about 1.2 s): the prompt must describe the keys and contain the word "json", and zod validates the result.
- **Web search** (`POST {base}/responses`, `qwen3.8-flash`, `tools: [{type: "web_search"}]`) took 12.4 s.
  - `output` held `message`, `web_search_call`, `message`.
  - 20 URLs arrived in `web_search_call.action.sources[].url`; there were **no** `url_citation` annotations. Read sources from `action.sources`.
  - Facebook and YouTube URLs appear, so the social/video filter is needed.
  - `usage.x_tools.web_search.count` = 1 is the billable search count.
- **Web search with `deepseek-v4.1-flash-1017`** (same question as the Qwen test):
  - It took 23.3 s and ran **8** `web_search_call`s, each billable at USD 0.01.
  - It used 79,357 input tokens, about 8% of a 1M free quota in one call.
  - It returned 61 URLs, and the first five were content-farm pages, not the Twitch forum post.
  - `qwen3.8-flash` answered the same question with 1 search, 2,479 tokens and the official post first.
  - **Never use DeepSeek for the search step.**
- **DeepSeek pricing** (China list price from the `bl` docs bundle; Singapore not published there):
  - CNY 1 to 2 per M input tokens and CNY 4 to 8 per M output tokens (off-peak to peak).
  - That is above `qwen3.7-flash` in Singapore (USD 0.03 / 0.13).
  - Rate limit: 120,000 total tokens per 6 s window.
- **`qwen3-asr-flash`:** 6 s of 16 kHz mono WAV (288 KB of base64) took 2.1 s.
  - `usage.seconds` is the billed audio.
  - With `enable_itn: true`, numbers come back as digits ("fifty" became "50"), so transcript search must match digits and words both ways.
  - A synthetic voice's "Chat" came back as "Chad".

## Endpoint and auth
- Base URL: `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1`. The legacy `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` still works.
- Header: `Authorization: Bearer $DASHSCOPE_API_KEY`. Keys are bound to the region they were created in, so create the key in Singapore.
- The official `openai` npm SDK works: `new OpenAI({ apiKey, baseURL })`, then `chat.completions.create(...)` and `responses.create(...)`.
- Responses API: supported in Singapore. Response ids stay valid for 7 days.
- Node passes vendor parameters (`enable_thinking`, `enable_search`, `search_options`, `asr_options`) as **top-level** fields of the request object. Python uses `extra_body`. **Settle in M2:** whether the TypeScript SDK forwards them as typed; cast the params object if needed.

## Models (USD per 1M tokens, Singapore list prices)
| Id | Input / output price | Context | Web search | Strict json_schema |
|---|---|---|---|---|
| `qwen3.7-flash` | 0.03 / 0.13 (≤32K) | 1M | yes | yes |
| `qwen3.8-flash` | 0.15 / 0.47 | 1M | yes | yes |
| `qwen3.7-plus` | 0.4 / 1.6 (≤256K) | 1M | yes | yes |
| `qwen3.8-max` | 2 / 6 | 1M | yes | yes |
| `qwen-plus`, `qwen-flash` | lower | 1M | **no** | json_object only |
- Thinking is **on by default** for the Qwen3.7 and Qwen3.8 families. Send `enable_thinking: false` for every structured call.
- Free quota: about 1M tokens per model for 90 days (Singapore, real-time calls only). Failed calls cost nothing.

## Rate limits (per primary account)
- `qwen3.7-plus`, `qwen3.7-flash`: 15,000 RPM, 5,000,000 TPM.
- `qwen3.8-max`, `qwen3.8-flash`: dynamic, tied to the monthly spend tier.
- `qwen3-asr-flash`: 100 RPM.

## Structured output
- `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }` on the Qwen3.7 and Qwen3.8 families.
- Do not set `max_tokens` with structured output. Unsupported schema keywords return HTTP 400, so keep schemas plain: objects, arrays, strings, enums, numbers and `required`.
- **Settled on 23 Oct:** strict mode works in Singapore for the Qwen3.7 and Qwen3.8 flash models, despite the json-mode page saying "Singapore region models are not supported yet". If strict mode fails, use `response_format: { type: "json_object" }` (the prompt must contain the word "json"), validate with zod, and retry once with the validation error appended.
- Combining structured output with `enable_search` is not documented. Do not combine them; the search step and the judge step are separate calls.

## Web search (the search step)
- Use the **Responses API**: `responses.create({ model: MODEL_SEARCH, input, tools: [{ type: "web_search" }] })`.
- Sources: read `output[]` items of type `web_search_call` → `action.sources[].url`. On 23 Oct no `url_citation` annotations came back; use them only if present.
- Chat Completions with `enable_search: true` does **not** return sources through the compatible protocol, so do not use it for search.
- `search_options.search_strategy: "agent"` is not supported by Qwen3.8 on Chat Completions. This does not matter on the Responses route.
- Price: USD 10 per 1,000 searches (USD 0.01 per call), plus the retrieved content billed as input tokens.

## Speech recognition, primary: `qwen-audio-3.1-asr-flash` (native HTTP API)
- **Endpoint:** `POST https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation` (the origin of `MODELSTUDIO_BASE_URL` plus this path). Headers: `Authorization: Bearer <key>`, `Content-Type: application/json`, `X-DashScope-SSE: disable`. This endpoint is **not** OpenAI-compatible. The project uses the configured SDK transport with `sdk.post` and the absolute native endpoint; this was verified in M2.
- **Body:**
  ```json
  {"model":"qwen-audio-3.1-asr-flash",
   "input":{"messages":[
     {"role":"user","content":[{"type":"input_text","text":"<previous chunk transcript, optional>"}]},
     {"role":"user","content":[{"type":"input_audio","input_audio":{"data":"data:audio/wav;base64,<...>"}}]}]},
   "parameters":{"format":"wav","sample_rate":"16000","language_hints":["en"],"vocabulary":{"Chat":5}}}
  ```
- **Context:** at most 5 context messages and 400 characters per round. The message holding `input_audio` must come last.
- **`vocabulary`:** instant hotwords, weight 1 to 5, or 50 for "super" hotwords (at most 50 of those).
- **Optional parameters:** `speaker_diarization_enabled` (this model only; it returns `output.sentences` with `speaker_id`). The model can also polish the text, which removes fillers and self-corrections. **Do not enable polishing:** quotes must be verbatim.
- **Response:** `output.text`, `output.sentence.words[]` (`text`, `begin_time`, `end_time` in ms, `punctuation`, `fixed`), and `usage { duration, input_tokens, output_tokens }`.
- **Observed 23 Oct:** the synthetic "Chat, is this real? I said I would do fifty push ups if we hit one hundred subs." came back as "Chat, is this real? I said I would do 50 push-ups if we hit 100 subs." in 2.2 s, with 85 input and 25 output tokens. Hearing "Chat" correctly did not need the hotword, whereas `qwen3-asr-flash` heard "Chad". Word times arrived, for example "Chat" at 240 ms.
- **Price (Singapore):** USD 0.15 per M input and USD 0.47 per M output tokens (published Singapore table checked 24 Oct 2026). Limit: 600 RPM.
- The `-streaming` (realtime WebSocket) and `-message` (WebSocket) variants cost about 6x more per token and only add sub-second captions, which this project does not need.

## Speech recognition, fallback: `qwen3-asr-flash` (OpenAI-compatible)
- `POST {base}/chat/completions` with `model: "qwen3-asr-flash"` and a user message whose content holds one part:
  `{ type: "input_audio", input_audio: { data: "data:audio/wav;base64,<...>" } }`
- `asr_options: { language: "en", enable_itn: true }` (top-level from Node).
- Limits: 5 minutes per recording, 10 MB of base64. A 15 s, 16 kHz mono WAV is about 640 KB of base64.
- Price: USD 0.000035/s (USD 0.126/hour). Free quota: 36,000 s (10 h). ASR models must be enabled in the workspace.
- English and French are supported.
- The realtime WebSocket model (`qwen3-asr-flash-realtime`) documents only a Python SDK, so this project uses 15 s chunks instead.

## Spend control
- **Budget Management:** a USD budget at account, workspace or API-key level, with alerts at 80% and 100%. "Stop Service When Budget Reached" makes calls return HTTP 429.
- **Free Quota Only:** per model (Model usage → Free Quota → "Free Quota Only"). After the free quota, calls fail with `AllocationQuota.FreeTierOnly` and nothing is charged.
- **Credits:** coupons apply automatically to pay-as-you-go bills, the soonest-expiring first. Check a coupon's "Applicable Scope" on the Expenses and Costs → Coupons page.

## Data
- Ordinary inference inputs and outputs are normally retained for up to 30 days. Legal and security exceptions can extend retention; stateful data remains until deleted. State these limits in `docs/PRIVACY.md`. Verified policy: https://www.alibabacloud.com/help/en/model-studio/data-retention-policy

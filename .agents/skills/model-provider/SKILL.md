---
name: model-provider
description: Verified Alibaba Cloud Model Studio (Qwen) calls for triage, web search, judging, VOD answers and speech recognition. Use before writing or changing anything in src/llm/, the companion's transcription, scripts/probe-models.ts, or model ids in .env.example.
---

# Model provider: Alibaba Cloud Model Studio (Singapore)

Read `references/model-studio.md` before writing model calls. It holds the endpoints, parameters, model ids, prices and limits checked against alibabacloud.com on 23 Oct 2026.

Rules:
- Every model call goes through `src/llm/client.ts`, which builds one `openai` SDK client with `baseURL = MODELSTUDIO_BASE_URL` and `apiKey = DASHSCOPE_API_KEY`.
- Model ids come from `.env` (`MODEL_TRIAGE`, `MODEL_SEARCH`, `MODEL_JUDGE`, `MODEL_VOD`, `MODEL_ASR`), never hard-coded in call sites.
- Items marked "settle in M2" conflict in the docs. Decide them with live calls in `scripts/probe-models.ts`, and record what was observed in `docs/models.md`.
- Log, for every call: model id, latency, input and output tokens, search calls, and the error code if any. The dashboard's status strip reads these.
- Budget and quota errors (HTTP 429 with a budget message, or `AllocationQuota.FreeTierOnly`) end the check as `unconfirmed` with reason `quota`. Never retry them.
- When the reference and the live docs disagree, the live docs win. Update the reference in the same commit.

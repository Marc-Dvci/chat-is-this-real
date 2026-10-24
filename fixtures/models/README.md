# Recorded Model Studio responses

These response bodies came from the reference-assisted Singapore probe identified in each
file's provenance. Availability uses the strict JSON schema request for `qwen3.8-flash`.
Native ASR uses the original system narration for the blue robot puzzle in the prerecorded
Twitch test. Audio, authorization headers and credentials are omitted. Request and response
identifiers in the original M2 fixtures are replaced; response field names, nesting, tokens and word timings are retained.

`fallback-asr.json` records one of the M6 repeated calls on the same original blue robot
narration. It retains the real compatible response body, including billed audio seconds.
The fallback has no word timestamps, so results use approximate segment timing.

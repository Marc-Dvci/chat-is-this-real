---
name: twitch-api
description: Verified Twitch Helix, EventSub WebSocket, OAuth, clips and Extension facts for this project. Use before writing or changing anything in src/twitch/, scripts/setup-twitch.ts, scripts/probe-twitch.ts or the Extension.
---

# Twitch API

Read `references/twitch-api.md` before writing Twitch code. It holds the endpoints, scopes, payload fields and limits checked against dev.twitch.tv on 23 Oct 2026.

Rules:
- When the reference and the live docs disagree, the live docs win. Fetch the page, follow it, and update the reference in the same commit.
- Items marked "verify in M1" are not documented. Build on them only after the M1 probe has observed them on a real stream, and record the result in `docs/probe.md`.
- Tests use frames recorded from Twitch in M1 (`fixtures/twitch/`), never hand-written payloads.

# Built with OpenAI Codex

The build follows `../02_BUILD_PLAN.md`. Each completed milestone links its checks and review evidence here.

| Milestone | What was built | Tests added | Review findings fixed | Live check result |
|---|---|---|---|---|
| M0 | Repository layout, local server, strict tooling and CI | Fastify health and private-path checks; compiled-process and environment regression checks; mutation check | TypeScript peer range, CI runtimes, npm cache, scanner permission, local environment loading | Local checks and CI tracked in [PR 1](https://github.com/Marc-Dvci/chat-is-this-real/pull/1); manual review deferred to the end at the user's request |
| M1 | Twitch authorization, real-frame capture, clip probes and automated prerecorded test stream | Callback security, recorded token validation, recorded-frame WebSocket entry point, watchdog and chat boundary | Null app scopes, mention-prefixed replies, badge preservation, cancellation and credential-safe encoder output | Real EventSub exchange, threaded reply, current archive and clips; observed alignment in [probe report](probe.md) |

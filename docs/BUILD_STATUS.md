# Engineering audit

## M0 foundation

The initial repository contained `AGENTS.md`, `.agents/`, `.codex/` and `.gitignore`.
Those instructions define milestone order and the review gates.

The server binds to loopback because the dashboard will control publication.
Schemas live in `src/shared/schemas.ts`; HTTP tests enter through Fastify `inject`.
The process check uses Playwright's request client. The browser walkthrough begins with M7.
Product commands fail with their required milestone instead of returning invented service results.

Dependencies are pinned in `package-lock.json`. Registry inspection selected TypeScript 6.0.3
because the current `typescript-eslint` peer range is `>=4.8.4 <6.1.0`.
Node.js 22 LTS is the CI baseline; the local installation is Node.js 24.
Vitest runs at most four workers. Playwright runs one worker and uses headless mode.
The workspace-local npm cache avoids writing to the machine's restricted global cache.
CI actions are pinned to immutable release commits. Gitleaks uses its Node.js 24 action runtime.
The secret-scan job has read access to pull-request commits so it scans both push and PR events.
The scanner version is pinned independently of the action's older default.

Local acceptance passed: clean install, typecheck, lint, unit tests, production build,
Playwright process check, npm dependency audit and a scan for fragments of loaded secrets.
Temporarily changing the health route made its entry-point test fail; restoring it made the suite pass.
On Windows, Playwright needs access outside the Codex sandbox to shut down its child server.
Startup loads the local `.env` before validating configuration; exported variables take precedence.
The process regression test verifies both cases using isolated temporary directories.
On 24 October 2026, the user deferred manual milestone reviews until the end of the build.
Automated checks and milestone PRs continue throughout the build.

## Acceptance gates

- M0: local checks, CI, commit attribution audit and review.
- M1: broadcaster and bot authorization, an explicitly started test stream, recorded raw frames,
  a threaded reply, a clip or documented fallback, and measured clap alignment.
- M2: approved model calls, free-quota and budget settings, and voice recordings.
- M3: real stream transcript and label spot-check before locking evaluation data.
- Later live checks, deployment and submission follow the plan's human gates.

## M1 audit

The authorization callback verifies one-use state and the configured account before persisting tokens.
Tokens are validated at startup and on subsequent use after an hour; refreshes are serialized per role.
The probe's app-token reply explicitly targets only the source channel.
Each chat send and clip creation rechecks that the approved stream is still live.
Cancellation aborts pending Helix requests and closes the terminal and EventSub connection.
Fixture export starts from captured raw frames and pseudonymizes identifiers; it selects the scripted chat exchange.
Twitch registration, sign-in, the test stream and the observed clap offset are the M1 acceptance gates.
The user's prerecorded-stream request replaces camera and microphone input for this probe.
The generated video contains original scripted narration, an explicit system-speech label and source timecodes.
The authorized encoder uses verified RTMPS transport and keeps stream keys out of persisted manifests and logs.
The real probe received the claim and broadcaster reply, confirmed the threaded bot response, found the live archive,
and created VOD and live clips. The decoded source-timecode match is recorded in `docs/probe.md`.
Recorded app validation exposed `scopes: null`; the token manager now handles it, with a real-response regression test.
Recorded API replies include a leading mention. The fixture preserves it for the command-parser milestone.
The fixture exporter preserves badge set names and versions because permissions depend on those fields.

## Contest source

The [official rules](https://twitchcon-codex.devpost.com/rules), checked on 24 October 2026,
require a working Twitch integration, Codex build evidence, the Codex session ID and a public
demonstration video. The submission period ends on 2 November 2026 at 14:00 Pacific Time.
The accessible project must remain free for judging through 15 November 2026.

## M2 preparation

The [model probe](model-probe.md) has a preview mode and requires explicit live opt-in.
All inference calls use the configured SDK client in `src/llm/client.ts`, including native ASR.
Structured output disables thinking, uses Zod validation and retries only once for unsupported
strict output or invalid JSON. Search candidates come from tool sources and citation annotations.
The search prose is discarded.

The source adapter validates DNS and redirects, pins the checked addresses, caps compressed
and expanded bodies, extracts readable text and retains useful published captions. A bounded
NASA source window supplies the evidence-verification regression case. Reserved-address,
URL, normalization and excerpt-rejection checks pass locally.

The Model Studio CLI sign-in was verified with `bl auth status`; skill and CLI versions matched.
The live probe is gated on the requested Model Studio usage approval.
The offline audit also prevents source-free judge calls and records skipped judgments.
Probe summaries retain missing results in their denominators and leave unmeasured rates
and latency percentiles empty. Regression checks cover those reporting cases.

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

## Acceptance gates

- M0: local checks, CI, commit attribution audit and review.
- M1: broadcaster and bot authorization, an explicitly started test stream, recorded raw frames,
  a threaded reply, a clip or documented fallback, and measured clap alignment.
- M2: approved model calls, free-quota and budget settings, and voice recordings.
- M3: real stream transcript and label spot-check before locking evaluation data.
- Later live checks, deployment and submission follow the plan's human gates.

## Contest source

The [official rules](https://twitchcon-codex.devpost.com/rules), checked on 24 October 2026,
require a working Twitch integration, Codex build evidence, the Codex session ID and a public
demonstration video. The submission period ends on 2 November 2026 at 14:00 Pacific Time.
The accessible project must remain free for judging through 15 November 2026.

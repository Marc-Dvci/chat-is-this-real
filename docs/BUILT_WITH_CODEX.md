# Built with OpenAI Codex

I built Chat Is This Real in one OpenAI Codex thread in VS Code, session
**`01a16cc3-1a5e-7d23-81c2-c9de487cc7fd`**, from 24 to 25 October 2026.

| Measure | Count |
|---|---|
| Milestone pull requests, each merged after green CI | 13 |
| Commits | 46 |
| File patches applied by Codex | 310 |
| Shell commands run by Codex (tests, probes, builds, `gh`) | 769 |
| Unit tests / browser tests at the final milestone | 124 / 6 |

## What Codex worked from

I wrote the plan and the rules before the first prompt. Codex read them at the start of
the thread and loaded the skills at each milestone.

| File | Role |
|---|---|
| Build plan (12 milestones, M0 to M11) | Scope, architecture, exact Twitch and Model Studio calls, acceptance checks per milestone |
| [AGENTS.md](../AGENTS.md) | Architecture rules, testing rules and review rules loaded in every Codex turn |
| [`milestone-close`](../.agents/skills/milestone-close/SKILL.md) | The closing routine: checks, log row, branch, PR, CI, merge |
| [`twitch-api`](../.agents/skills/twitch-api/SKILL.md) | Verified Helix endpoints, scopes and EventSub WebSocket rules |
| [`model-provider`](../.agents/skills/model-provider/SKILL.md) | Verified Model Studio calls for structured output, search and speech |
| [`eval-discipline`](../.agents/skills/eval-discipline/SKILL.md) | How the evaluation data is locked, run once and reported |
| [`ui-walkthrough`](../.agents/skills/ui-walkthrough/SKILL.md) | The Playwright pass over every screen, with screenshot review |
| [`writing-rules`](../.agents/skills/writing-rules/SKILL.md) | Rules for docs, captions and on-screen text |

The rules that shaped the code most:

- **The model proposes; the code decides.** Final verdicts come from a four-row table in
  [`verdict-rules.ts`](../src/check/verdict-rules.ts).
- **No model-written quote, timestamp, link or username reaches a viewer.** Quotes come
  from fetched source text or stored transcript segments.
- **Test the caller's entry point.** EventSub tests feed recorded Twitch frames into the
  WebSocket class; HTTP tests go through Fastify `inject`.
- **Fixtures are recorded from real services,** never written to match the code.

## Milestones

| Milestone | What Codex built | Proof at merge |
|---|---|---|
| [M0 Repository](https://github.com/Marc-Dvci/chat-is-this-real/pull/1) | Strict TypeScript, ESLint, Vitest, CI with a gitleaks scan | Typecheck, lint and tests in CI |
| [M1 Twitch probe](https://github.com/Marc-Dvci/chat-is-this-real/pull/2) | OAuth setup, EventSub capture, threaded reply, Clip From VOD, live clip | Real frames in `fixtures/twitch/`, playable clip, VOD offset measured at -3.4 s |
| [M2 Model probe](https://github.com/Marc-Dvci/chat-is-this-real/pull/3) | Model Studio adapter, guarded source fetching, excerpt verification | 4 text models and 1 speech model measured over 3 runs ([models](models.md)) |
| [M3 Ground truth](https://github.com/Marc-Dvci/chat-is-this-real/pull/4) | 72 labelled claims, a stream transcript and 26 stream-memory questions | Hash lock committed before the engine existed ([lock](../eval/LOCK.md)) |
| [M4 Twitch core](https://github.com/Marc-Dvci/chat-is-this-real/pull/5) | Commands, permissions, cooldowns, SQLite history, moderation, guarded publisher | Live `!real` reply stored, acknowledged in 593 ms, deleted text removed |
| [M5 Check engine](https://github.com/Marc-Dvci/chat-is-this-real/pull/6) | Triage, fetching, evidence proposal, verification, verdict rules, cache, queue | 44/48 dev verdicts, 0 reversed |
| [M6 Stream memory](https://github.com/Marc-Dvci/chat-is-this-real/pull/7) | Audio companion, transcript search, word timing, clips, caption and media imports | 20/20 moments found; live clip 0.09 s from the spoken word |
| [M7 Review desk](https://github.com/Marc-Dvci/chat-is-this-real/pull/8) | Desk, Viewer History, Library, Settings, 380 px OBS dock | Playwright walkthrough of every screen with axe-core |
| [M8 Overlay and votes](https://github.com/Marc-Dvci/chat-is-this-real/pull/9) | SSE overlay, vote tally, approval before reveal, points, anonymous leaderboard | Desk, overlay DOM and SQLite agree at every step |
| [M9 Public receipts](https://github.com/Marc-Dvci/chat-is-this-real/pull/10) | Signed Cloudflare Worker, KV storage, removal queue | 116 unit tests and 5 browser tests |
| [M10 Browser demo](https://github.com/Marc-Dvci/chat-is-this-real/pull/11) | SQLite WebAssembly in a SharedWorker running the same domain code | Two views, votes and receipts checked in the Workers runtime |
| [M11 Hardening](https://github.com/Marc-Dvci/chat-is-this-real/pull/12) | Container, red-team suite, engine freeze, single heldout run | 23/24 heldout verdicts ([evaluation](evaluation.md)) |
| [Deployment](https://github.com/Marc-Dvci/chat-is-this-real/pull/13) | Static Cloudflare Pages build of the demo | Production checks of voting, both views and mobile receipts |

## How Codex checked its own work

**Recorded Twitch traffic.** Codex captured EventSub frames from my channel during M1 and
replayed them through `EventSubWs` in every later test, so the parser, router and
moderation paths run on bytes Twitch actually sent.

**Locked data, frozen engine.** The claim set was hashed and committed in M3, two
milestones before the checker. The engine was fingerprinted at
[`c5f6bdc`](../eval/FREEZE.json) before the heldout messages were opened, and the heldout
split ran once.

**A bug caught by a recorded source.** A French chat message, *"stardew sur PC c'est
jusqu'à 8 joueurs maintenant"*, came back UNCONFIRMED. Codex traced it to passage
selection: tokens shorter than three characters were dropped, so "PC" and "8" never
matched the changelog line *"You can now have up to 8 players on PC"*. It kept short
platform names and counts, added a regression on the recorded changelog, then ran a
[mutation probe](../eval/results/hardening-mutation-2026-10-25T08-49-26-634Z.json): it
restored the old selector, watched the regression fail, and restored the fix.

**The real UI, looked at.** Each UI milestone ended with a headless Playwright pass over
every screen and button, screenshots saved per state, and axe-core on every route.

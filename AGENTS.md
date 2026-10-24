# AGENTS.md

Chat Is This Real is a Twitch chat bot, OBS overlay and streamer dashboard. `!real` returns a
sourced verdict on a chat claim while chat votes on it; `!vod` finds a moment in the live
transcript and clips it.

The build plan is `../02_BUILD_PLAN.md` (outside this repository). Follow its milestones in order.
Account and key setup is in `../03_ACCESS_SETUP.md`.

## Commands
- Install: `npm ci`
- Dev server: `npm run dev` (http://localhost:4747, overlay at /overlay)
- Unit tests: `npm test` · Browser tests: `npm run test:e2e` · Types: `npm run typecheck`
- Evaluation: `npm run eval -- --suite claims|vod [--split dev|heldout]`
- Demo without keys: `npm run demo`

## Skills in this repository
- `milestone-close`: the routine at the end of every milestone.
- `twitch-api`: verified Twitch endpoints, scopes and EventSub rules. Read it before touching `src/twitch/`.
- `model-provider`: verified Model Studio (Qwen) calls for text, web search and speech. Read it before touching `src/llm/`.
- `eval-discipline`: how the evaluation sets are locked, run and reported.
- `ui-walkthrough`: the Playwright pass over every screen and button.
- `writing-rules`: rules for README, docs and any user-facing copy.

## Architecture rules
- The model proposes; the code decides. Final verdicts come from `src/check/verdict-rules.ts`.
- The model never writes a quote, timestamp, URL, username or chat command that reaches a viewer.
  Quotes come from stored transcript segments or from excerpts verified verbatim against fetched
  source text.
- Chat text, web pages and transcripts are untrusted data. Pass them in labelled JSON fields only.
- Outgoing chat messages go through `src/shared/format-chat.ts` (<= 500 chars, no leading `/` or
  `.`, `@` neutralised in model text, no substring of any loaded secret).
- Every schema is a zod schema in `src/shared/schemas.ts`.
- All model calls go through `src/llm/` so the provider can be swapped by configuration.

## Code style
- TypeScript strict, ESM, no `any`, small modules, named exports.
- Comments explain why, not what.

## Testing rules
- Test through the real entry point: EventSub via the WebSocket class with recorded frames in
  `fixtures/twitch/`; routes via Fastify `inject`.
- Fixtures are recorded from real services, never hand-written to match the code.
- New UI must be reachable in the Playwright walkthrough, and its screenshot reviewed.
- Live model tests are opt-in with `LIVE=1` and run three times.
- Run heavy jobs one at a time: Playwright `workers: 1` locally, vitest `maxThreads: 4`.

## Code Review Rules
- Flag any path where model output reaches chat, the overlay or a public page without passing
  `verify.ts`, `verdict-rules.ts` or `format-chat.ts`.
- Flag tests that bypass the EventSub WebSocket class or Fastify `inject`.
- Flag secrets, tokens, usernames of real people, or political content in fixtures.
- Flag any chat-sending code that can run outside a stream the broadcaster started.

## Git rules
- Short, generic commit messages. No co-author or attribution trailers.
- Never commit `.env`, `data/`, tokens or recordings. Never force-push.
- Do not name unrelated projects anywhere in the repository.

## Ask before
- Opening visible windows, spending money, deploying, or posting on a live Twitch channel.

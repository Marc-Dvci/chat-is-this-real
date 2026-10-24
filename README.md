# Chat Is This Real

**Sourced checks and stream memory for Twitch streamers and their communities.**

Built with OpenAI Codex. The build follows the milestone plan in `../02_BUILD_PLAN.md`.

## Repository foundation

Use Node.js 22 LTS. Node.js 24 is also supported for local development.

```sh
npm ci
npm run dev
```

The foundation server listens on `127.0.0.1:4747`. Its health endpoint is
[`/api/health`](http://localhost:4747/api/health).

On Windows, use `npm.cmd` when PowerShell's execution policy blocks `npm.ps1`.

```sh
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
npm start
```

## Build evidence

The [milestone log](docs/BUILT_WITH_CODEX.md) records validation and reviews.
The [engineering audit](docs/BUILD_STATUS.md) records dependencies, decisions and acceptance gates.
The project instructions are in [AGENTS.md](AGENTS.md).

| Claim | File | Test |
|---|---|---|
| The local server exposes a schema-validated health endpoint. | `src/server/app.ts` | `tests/server.test.ts`, `e2e/server.spec.ts` |
| Local secrets and stored files have no HTTP routes. | `src/server/app.ts` | `tests/server.test.ts` |

## Layout

`src/` holds the local server, Twitch adapters, checking, stream memory, voting, storage and shared schemas.
`web/` holds the dashboard and overlay entry points. `companion/` holds host audio capture.
`worker/` holds public result pages. `eval/` holds locked ground truth and measured results.
`fixtures/` holds recorded service data. `scripts/` holds setup, probes and figures.

## Current scope

M0 provides the server foundation and checks. Product commands report their required milestone
until their implementation passes that milestone's acceptance checks.

## License

[MIT](LICENSE).

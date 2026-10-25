# Clean-clone quickstart

The [recorded check](../eval/results/quickstart-2026-10-25T13-08-11-003Z.json) cloned committed package `a74c35b30e182a9a39f4b3492845093c209eb900` into a fresh local directory, installed locked dependencies with a new workspace npm cache, built it and started the compiled recorded demo. It contained no `.env`. The child environment excluded model and Twitch settings.

| Step | Observed time |
|---|---|
| clone | 0.78 s |
| install | 12.64 s |
| build | 3.61 s |
| ready | 0.69 s |
| Total | 17.78 s |

Environment: Node.js v24.13.1, win32. The clone source was local Git; an internet clone adds its own transfer time. Install time includes registry access on this connection. The readiness check fetched the health endpoint, built page and multilingual demo data. The demo loaded 12 recorded checks.

Reproduce on a clean committed checkout with `npx tsx scripts/probe-quickstart.ts`. Raw command logs and the test checkout stay in ignored local directories.

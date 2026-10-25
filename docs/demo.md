# Recorded demo

I ship the review desk, overlay, Viewer history, Library and Settings with recorded results.
The demo needs no Twitch or Model Studio credentials. Its chat and voters are scripted.
The stored model outcomes and transcript selections come from actual recorded runs.

`npm ci && npm run demo` opens the local version. `npm run build:demo` produces the static
assets in `web-dist/`. The Worker serves those assets at `/demo/` and a launch page at `/`.
The static version runs the same SQLite schema and stores, check queue, recorded replay,
evidence verifier, verdict rules, VOD resolver, presentation controller and vote tally.
SQLite runs in WebAssembly inside a browser SharedWorker. The desk and overlay communicate
with that same worker, so their state agrees without a public mutation API.

The browser keeps its scripted state in memory. It makes no model calls, Twitch posts or
cloud writes. The demo supports only its listed recorded examples. An unrecorded input
ends privately with a prompt to choose a recorded example. Imported captions stay local
to the demo; media transcription requires the connected local app.

The public bundle contains verified source excerpts and public source metadata. It does
not contain complete fetched pages, keys, OAuth tokens or real chat account identifiers.
The build checks the original stored source hashes and public projections before export.
`demo-proof.json` records the input and output hashes. The original recorded data remains
in `fixtures/demo/`; generated web assets are ignored by Git.

The [chat showcase](showcase.md) records the newly authored French, Spanish and English
examples. `CAPTIONS.md` lists the gallery captions. The editable multilingual figure lives
in `docs/gallery/` and regenerates with `npm run figures:showcase`.

The static version needs SharedWorker and WebAssembly support. The headless Chromium
walkthrough checks the actual Workers runtime, both views, a complete vote and reveal,
source receipts, desktop and 380 px layouts, accessibility and no backend or external
requests. The local walkthrough also covers history, caption import, Settings and purge.

The [public demo](https://chat-is-this-real.pages.dev/demo/) runs on static Cloudflare Pages.
[Free hosting](free-hosting.md) records its upload guard, cost boundary and production checks.
The signed receipt Worker is a separate optional service. Local Workers tests require no
cloud login.

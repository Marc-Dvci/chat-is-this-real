# Free public demo

The [project site](https://chat-is-this-real.pages.dev/) and
[recorded demo](https://chat-is-this-real.pages.dev/demo/) are live. The
[deployment report](../eval/results/deployment-static.json) records the uploaded commit,
static-only configuration, production browser checks and upload-guard mutation.

I publish the keyless demo as static Cloudflare Pages assets. The review desk, transcript,
votes and overlay run in the browser’s shared SQLite worker. The upload contains HTML,
JavaScript, WebAssembly, fonts and recorded public demo data. It includes no Pages
Functions, Worker entry point, storage binding, API credentials or paid inference.

[Cloudflare’s pricing](https://developers.cloudflare.com/pages/functions/pricing/) states
that static asset requests are free and unlimited on both account plans. I upload the
locally built assets directly and use the included `pages.dev` address. This creates no
cloud build pipeline or purchased domain. The signed receipt Worker remains a separate
optional deployment that requires verified Free-plan limits.

## Build and publish

```sh
npx tsx scripts/build-pages.ts
npx tsx scripts/deploy-pages.ts
```

The upload guard checks the exact file list, SHA-256 fingerprints, secret fragments,
static-only manifest, account and project bindings before upload. It refuses executable
Functions and private files. The source checkout must be committed. The script records
the deployment address, commit and observed configuration in `data/deploy/`.

`scripts/build-pages.ts` produces a fresh directory under ignored `public-dist/` and
records its path in `.cache/pages-build.json`. The home page lives at `/`; the keyless
desk, Library, Settings and overlay live under `/demo/`. A Pages rewrite serves demo
receipt links. An explicit static 404 prevents private API or credential paths from
falling back to the dashboard. CSP permits the browser SQLite WebAssembly worker.

The receipt rewrite targets an extensionless HTML shell with an explicit content type.
This preserves the requested receipt URL through Pages canonicalization. The probe
requires that original URL and a visible public receipt, rather than matching a verdict
elsewhere in the review desk.

## Production acceptance

```sh
npx tsx scripts/probe-pages.ts --base https://YOUR-PROJECT.pages.dev/
```

The browser probe checks real routes, two shared views, a full vote and approved reveal,
French and Spanish outcomes, mobile receipts, accessibility, and the absence of model,
backend and external requests. It saves screenshots and the observed report under
`data/deploy/`. Its local pass uses Wrangler’s actual Pages runtime.

This deployment serves recorded examples. The connected bot, host audio companion and
private history stay on the streamer’s machine. Public receipt publication uses the
separate [signed Worker](public-pages.md), with its own account-plan verification.

# Demo

## Online, no account

[chat-is-this-real.pages.dev/demo](https://chat-is-this-real.pages.dev/demo/) opens the
review desk with a stream's chat already in it. Open the overlay link beside it and both
views follow the same state.

1. Pick a chat message and open its check: the verdict, the explanation and the verified
   excerpt with its source.
2. Start the check on stream, cast the viewer votes, then approve the reveal. The overlay
   shows the stamp and chat's split.
3. Try the French and Spanish messages, the pushups `!vod` request and Viewer History.

The results in the demo come from recorded runs of the real engine. The browser runs the
same code as the local app: the SQLite schema and stores, check queue, evidence verifier,
verdict table, stream-memory resolver, presentation controller and vote tally. SQLite runs
in WebAssembly inside a SharedWorker that the desk and the overlay share.

Hosting is static Cloudflare Pages: no server code, no storage and no model calls.

## Local, no keys

Install Node.js 24 LTS, then:

```sh
npm ci
npm run demo
```

Open `http://localhost:4747/` and `http://localhost:4747/overlay`. A clean clone
installs, builds and serves the demo in 17.8 s on a six-core desktop
([measurement](../eval/results/quickstart-2026-10-25T13-08-11-003Z.json)).
[Docker](container.md) serves the same demo.

## Build and publish

```sh
npm run build:demo                 # static assets in web-dist/
npx tsx scripts/build-pages.ts     # Pages bundle
npx tsx scripts/deploy-pages.ts    # upload with Wrangler
```

[`e2e/static-demo.spec.ts`](../e2e/static-demo.spec.ts) runs the built demo in the
Workers runtime and checks both views, a full vote and reveal, receipts, desktop and
380 px layouts, accessibility, and that the page makes no backend or external requests.

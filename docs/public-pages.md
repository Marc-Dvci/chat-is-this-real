# Public receipts

A reviewed check can be published as a receipt page that chat can open. The bot's reply
links to it: `NOT REAL: <explanation>. Source: <domain>. Details: <receipt link>`.

Receipts are served by a Cloudflare Worker at
[receipts.chatisthisreal.workers.dev](https://receipts.chatisthisreal.workers.dev/), on the
Workers Free plan, with Cloudflare KV for storage.

## What a receipt shows

- **Claim check:** the claim with handles redacted, the verdict, the explanation, each
  verified excerpt with its source title, domain, tier and date, and the UTC check time.
- **Stream memory:** the stored quote, its stream time, the indexed coverage and links to
  the Twitch clip and VOD.

## Publishing

The local server projects the result through `PublicResults`: it re-checks the stored
source hashes and literal excerpts and re-applies the verdict table. It signs the upload,
and chat receives the link only after the server has fetched the page successfully.

- HMAC-SHA-256 over the method, path, request time, nonce and exact UTF-8 body. Signatures
  expire after five minutes.
- The Worker accepts signed writes only, validates the public schema and the verdict table
  again, and rejects unsafe source addresses. Uploads are limited to 256 KiB.
- Receipts expire after 30 days. Pages and JSON responses use `Cache-Control: no-store`.

## Removal

Deleting a source message, or purging its viewer, queues removal of every receipt built on
it. The queue persists across restarts and retries until the Worker confirms. A removed
receipt leaves a text-free revocation marker for 30 days, so replaying the same signed
upload cannot restore it. KV changes can take up to 60 seconds to reach every region.

## Live check

[`scripts/probe-receipts.ts`](../scripts/probe-receipts.ts) publishes three recorded checks
to the deployed Worker through the production publisher, reads each page back, removes one
and polls until it is gone. On 27 October 2026: 3 of 3 receipts answered 200, and the
removed receipt answered 404 ([report](../eval/results/receipts-live-1793056519980.json)).

## Setup

1. `npm run setup:public` writes a random signing key to the ignored `.env` and
   `worker/.dev.vars` files.
2. `npm run build`, then `npm run worker:check` bundles the Worker without deploying.
   `npm run worker:dev` serves it locally.
3. `npx wrangler login`, then deploy with the key as a Worker secret:
   `npx wrangler deploy --config worker/wrangler.toml --secrets-file worker/.dev.vars`.
   Wrangler creates the KV namespace on the first deploy.
4. Set `RESULTS_BASE_URL` to the Worker's HTTPS origin and restart the local server. The
   desk enables **Publish link**.

## Tests

[`tests/public-pages.test.ts`](../tests/public-pages.test.ts) drives the Worker's fetch
handler and the Fastify routes: signature tampering, expiry, secret fragments, unsafe
addresses, metadata escaping, storage failure, repeated uploads and source removal during
an upload. [`e2e/public-pages.spec.ts`](../e2e/public-pages.spec.ts) runs the Worker in
Wrangler's local runtime with KV and checks desktop and 380 px layouts and accessibility.

# Public receipts

I publish a reviewed check to a small Cloudflare Worker. Chat receives a link only after
the local server has fetched that page successfully. The public page contains the claim,
the stored verdict, verified excerpts, source links and a UTC check time. A VOD receipt
contains the stored quote, its time, indexed coverage and links to Twitch.

## Local setup

1. Run `npm run setup:public`. This generates a random signing key in the ignored `.env`
   and `worker/.dev.vars` files. It does not upload the key or create cloud resources.
2. Run `npm run build`, then `npm run worker:check`. The latter bundles the Worker without
   deploying it. `npm run worker:dev` serves a local Workers runtime.
3. Before a first deployment, approve the Cloudflare account and deployment. Sign in with
   `npx wrangler login` in your own terminal. This opens a browser.
4. After approval, deploy with `npm run worker:deploy`. Wrangler creates the `RESULTS` KV
   binding. The required secret is `RESULTS_SIGNING_KEY`; load the generated value through
   Wrangler's secret input without putting it in command history or chat.
5. Set `RESULTS_BASE_URL` to the site's HTTPS origin, then restart the local server.
   The same signing key must be configured on both sides.

The dashboard enables **Publish link** when both settings are valid. A sensitive claim
requires a second confirmation. Publishing a link makes the displayed claim public.
Copying an existing link checks its availability again. Demo mode uses local recorded
results and never publishes to Cloudflare.

## Storage and removal

The Worker stores each receipt for 30 days with a KV expiration. It stores no chat account
identifiers, model credentials or complete fetched pages. Public claims redact handles.
An unpredictable identifier is an address, not an access control: anyone with its link
can read the page. Public URLs should be shared only after review.

Deleting source messages or purging their viewer's stored text queues removal of their
public receipts. The queue persists across local restarts. It clears the queued result
body immediately and retries failed removals. The dashboard shows pending removals.
Only the receipt identifier and transport metadata remain while removal is pending.
After removal, KV retains a text-free revocation marker for 30 days. Replaying the same
signed upload cannot restore that receipt.

Cloudflare KV is eventually consistent. A remote write or removal can take up to 60
seconds to appear in another region. Already loaded pages, third-party copies and browser
history cannot be recalled. The page and JSON responses use `Cache-Control: no-store`.

## Trust boundary

The local server projects a result through `PublicResults`: source body hashes and literal
excerpts are checked again, and the deterministic verdict table is applied. VOD quotes
and offsets are resolved from stored transcript segments. The Worker accepts only signed
writes, checks the public schema and verdict table, and rejects unsafe source addresses.
It does not infer or rewrite evidence.

HMAC-SHA-256 binds the method, path, request time, nonce and exact UTF-8 body. Signatures
expire after five minutes. Result identifiers derive from a random nonce and the signed
body. Retries preserve the same identifier. The upload limit is 256 KiB. Reads expose only
the public result schema. Third-party clip players load only after a visitor opens them;
small screens retain the direct Twitch links.

## Checks and current status

`tests/public-pages.test.ts` drives the Worker fetch entry point and Fastify routes. It
covers signature tampering, expiry, secret fragments, unsafe addresses, metadata escaping,
storage failure, repeated uploads and source removal during an upload.
`e2e/public-pages.spec.ts` uses Wrangler's actual local runtime with KV and built assets.
It checks desktop and 380 px layouts, accessibility and browser errors.

The local runtime and deployment bundle have passed. No public deployment or cloud account
has been approved yet. The public URL and a production Twitch embed remain acceptance
checks after that approval. No claim of a deployed public link is made here.

References: [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/),
[KV writes and propagation](https://developers.cloudflare.com/kv/api/write-key-value-pairs/),
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[local test harness](https://developers.cloudflare.com/workers/testing/test-harness/get-started/),
[Twitch clip embeds](https://dev.twitch.tv/docs/embed/video-and-clips/).

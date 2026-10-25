import { decideVerdict } from '../src/check/verdict-rules.js';
import { publicReceiptSchema, publicRevokedSchema, publicStoredSchema, publishBodySchema, resultSigningKeySchema, type PublicResult } from '../src/shared/schemas.js';
import { publicResultId, verifyResultRequest } from '../src/shared/result-signing.js';

export interface WorkerEnv {
  RESULTS: { get(key: string): Promise<string | null>; put(key: string, value: string, options: { expirationTtl: number }): Promise<void>; delete(key: string): Promise<void> };
  ASSETS: { fetch(request: Request): Promise<Response> };
  RESULTS_SIGNING_KEY?: string;
}
const ttl = 30 * 24 * 60 * 60;
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src https://clips.twitch.tv; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" };
function json(value: unknown, status = 200) { return Response.json(value, { status, headers }); }
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
function protectedValue(value: string, secret: string): boolean { for (let index = 0; index <= secret.length - 12; index++) if (value.includes(secret.slice(index, index + 12))) return true; return false; }
function secureUrl(value: string): URL { const url = new URL(value); if (url.protocol !== 'https:' || url.username || url.password || value.length > 2048) throw new Error('Invalid public URL.'); return url; }
function validateResult(value: PublicResult): void {
  if (!value.claim || value.claim.length > 1000) throw new Error('Invalid public claim.');
  if (value.type === 'fact') {
    if (value.explanation.length > 200 || value.sources.length > 6 || value.evidence.length > 30 || decideVerdict(value.verdict, value.evidence) !== value.verdict) throw new Error('Invalid evidence decision.');
    for (const source of value.sources) if (secureUrl(source.url).hostname !== source.domain) throw new Error('Invalid source domain.');
    for (const evidence of value.evidence) if (!value.sources.some((source) => source.id === evidence.source_id) || evidence.excerpt.length > 2000) throw new Error('Missing verified source.');
  } else {
    if (value.quote.length > 300 || value.coverage.length > 6 || value.found && (!value.quote || value.offset_s === null || value.offset_s < 0 || value.end_s === null || value.end_s <= value.offset_s || !/^\d+$/u.test(value.vod_id ?? ''))) throw new Error('Invalid stored moment.');
    if (value.clip) {
      for (const address of [value.clip.clip_url, value.clip.vod_url]) if (address) {
        const url = secureUrl(address);
        if (!(url.hostname === 'clips.twitch.tv' && /^\/[A-Za-z0-9_-]+$/u.test(url.pathname) || url.hostname === 'www.twitch.tv' && /^\/videos\/\d+$/u.test(url.pathname))) throw new Error('Invalid Twitch URL.');
      }
    }
  }
}
async function readBody(request: Request): Promise<string> {
  const reader = request.body?.getReader(); if (!reader) throw new Error('Missing body.');
  const parts: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 262_144) { await reader.cancel(); throw new RangeError('Body limit.'); } parts.push(chunk.value); }
  } finally { reader.releaseLock(); }
  const all = new Uint8Array(size); let offset = 0; for (const part of parts) { all.set(part, offset); offset += part.length; }
  return new TextDecoder('utf-8', { fatal: true }).decode(all);
}
async function signedWrite(request: Request, env: WorkerEnv, url: URL): Promise<Response> {
  const secret = resultSigningKeySchema.safeParse(env.RESULTS_SIGNING_KEY); if (!secret.success) return json({ error: 'Public publishing is not configured.' }, 503);
  const time = request.headers.get('x-results-time') ?? '', nonce = request.headers.get('x-results-nonce') ?? '', signature = request.headers.get('x-results-signature') ?? '';
  if (!/^\d{13}$/u.test(time) || Math.abs(Date.now() - Number(time)) > 300_000 || !/^[A-Za-z0-9_-]{24,80}$/u.test(nonce) || !/^[a-f0-9]{64}$/iu.test(signature)) return json({ error: 'Signature refused.' }, 401);
  let body: string;
  try { body = await readBody(request); } catch (error) { return json({ error: 'Invalid result body.' }, error instanceof RangeError ? 413 : 400); }
  if (!await verifyResultRequest(secret.data, request.method, url.pathname, time, nonce, body, signature)) return json({ error: 'Signature refused.' }, 401);
  const match = /^\/api\/results\/([A-Za-z0-9]{10})$/u.exec(url.pathname);
  if (request.method === 'DELETE' && match?.[1]) {
    // Keep no receipt text, but prevent a still-valid signed upload from restoring it.
    await env.RESULTS.put(`result:${match[1]}`, JSON.stringify(publicRevokedSchema.parse({ revoked: true })), { expirationTtl: ttl });
    return json({ deleted: true });
  }
  let result: PublicResult;
  try {
    const parsed = publishBodySchema.parse(JSON.parse(body)); validateResult(parsed.result);
    if (protectedValue(body, secret.data) || protectedValue(JSON.stringify(parsed), secret.data)) throw new Error('Protected content.');
    result = parsed.result;
  } catch { return json({ error: 'The result contains invalid or protected content.' }, 400); }
  try {
    const id = await publicResultId(secret.data, nonce, body), found = await env.RESULTS.get(`result:${id}`);
    if (found && publicRevokedSchema.safeParse(JSON.parse(found)).success) return json({ error: 'This receipt has been removed.' }, 409);
    const existing = found ? publicStoredSchema.parse(JSON.parse(found)) : undefined;
    if (existing && JSON.stringify(existing.result) !== JSON.stringify(result)) return json({ error: 'Public identifier conflict. Try a new publication.' }, 409);
    const stored = existing ?? publicStoredSchema.parse({ result, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + ttl * 1000).toISOString() });
    if (!existing) await env.RESULTS.put(`result:${id}`, JSON.stringify(stored), { expirationTtl: ttl });
    return json(publicReceiptSchema.parse({ id, url: `${url.origin}/r/${id}`, expires_at: stored.expires_at }), existing ? 200 : 201);
  } catch { return json({ error: 'Public storage is temporarily unavailable. Try again.' }, 503); }
}
async function handle(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'POST' && url.pathname === '/api/results' || request.method === 'DELETE' && /^\/api\/results\/[A-Za-z0-9]{10}$/u.test(url.pathname)) return signedWrite(request, env, url);
  if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405);
  if (url.pathname === '/favicon.ico') return new Response(null, { status: 204, headers });
  const match = /^\/(api\/results|r)\/([A-Za-z0-9]{10})$/u.exec(url.pathname);
  if (match?.[2]) {
    const raw = await env.RESULTS.get(`result:${match[2]}`), stored = raw ? publicStoredSchema.safeParse(JSON.parse(raw)) : undefined;
    if (!stored?.success || Date.parse(stored.data.expires_at) <= Date.now()) return json({ error: 'This result is unavailable or has expired.' }, 404);
    if (match[1] === 'api/results') return json(stored.data.result);
    const assetUrl = new URL('/index.html', url), asset = await env.ASSETS.fetch(new Request(assetUrl, { method: 'GET' }));
    if (!asset.ok) return json({ error: 'The public page build is unavailable.' }, 503);
    const title = escape(`${stored.data.result.claim} | Chat Is This Real`), description = escape(stored.data.result.type === 'fact' ? stored.data.result.explanation : stored.data.result.quote);
    const html = (await asset.text()).replace(/<title>[\s\S]*?<\/title>/u, `<title>${title}</title>`).replace('</head>', `<meta property="og:title" content="${title}"/><meta property="og:description" content="${description}"/></head>`);
    return new Response(request.method === 'HEAD' ? null : html, { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
  }
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/r/')) return json({ error: 'Result not found.' }, 404);
  if (url.pathname === '/') return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Chat Is This Real</title><body><main><h1>Chat, is this real?</h1><p>Sourced checks and stream memory for Twitch.</p><a href="/demo/">Open the recorded demo</a></main></body></html>', { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
  return env.ASSETS.fetch(request);
}
export default { async fetch(request: Request, env: WorkerEnv): Promise<Response> { try { return await handle(request, env); } catch { return json({ error: 'Public results are temporarily unavailable.' }, 503); } } };

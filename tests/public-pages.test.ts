import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import worker, { type WorkerEnv } from '../worker/index.js';
import { signResultRequest } from '../src/shared/result-signing.js';
import { publicReceiptSchema, publicResultSchema } from '../src/shared/schemas.js';
import { openDatabase } from '../src/store/database.js';
import { CheckStore } from '../src/store/check-store.js';
import { PublicResults } from '../src/server/public-result.js';
import { loadDemoCatalog } from '../src/demo/replay.js';
import { seedDemo } from '../src/demo/seed.js';
import { buildApp } from '../src/server/app.js';

const secret = 'ab'.repeat(32), origin = 'https://results.example.test', nonce = 'recorded-publication-nonce-01';
function memory() {
  const values = new Map<string, string>(), expirations: number[] = [];
  const env: WorkerEnv = { RESULTS_SIGNING_KEY: secret, RESULTS: { get: async (key) => values.get(key) ?? null,
    put: async (key, value, options) => { values.set(key, value); expirations.push(options.expirationTtl); }, delete: async (key) => { values.delete(key); } },
    ASSETS: { fetch: async () => new Response(await readFile('web/index.html', 'utf8'), { headers: { 'Content-Type': 'text/html' } }) } };
  return { values, expirations, env };
}
async function signed(method: string, path: string, body: string, time = String(Date.now())) {
  const signature = await signResultRequest(secret, method, path, time, nonce, body);
  return new Request(`${origin}${path}`, { method, headers: { 'Content-Type': 'application/json', 'x-results-time': time, 'x-results-nonce': nonce, 'x-results-signature': signature }, body });
}
function recordedResult() {
  const db = openDatabase(':memory:'); seedDemo(db, loadDemoCatalog());
  const job = new CheckStore(db).get('demo-check-claim-029'); if (!job) throw new Error('Missing recorded result.');
  const result = new PublicResults(db).project(job); db.close(); return result;
}
it('stores a verified real result for thirty days, retries idempotently and serves safe page metadata and all result fields', async () => {
  const { env, expirations, values } = memory(), result = recordedResult(), body = JSON.stringify({ result });
  const response = await worker.fetch(await signed('POST', '/api/results', body), env);
  expect(response.status).toBe(201);
  const receipt = publicReceiptSchema.parse(await response.json()); expect(receipt.id).toMatch(/^[A-Za-z0-9]{10}$/u);
  expect(expirations).toEqual([2_592_000]);
  const again = await worker.fetch(await signed('POST', '/api/results', body), env); expect(again.status).toBe(200); expect(values.size).toBe(1);
  expect(await again.json()).toEqual(receipt);
  const api = await worker.fetch(new Request(`${origin}/api/results/${receipt.id}`), env); expect(api.status).toBe(200); expect(publicResultSchema.parse(await api.json())).toEqual(result);
  const page = await worker.fetch(new Request(receipt.url), env); expect(page.status).toBe(200); expect(await page.text()).toContain('The Sun is a star. | Chat Is This Real'); expect(page.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  expect((await worker.fetch(await signed('DELETE', `/api/results/${receipt.id}`, '{}'), env)).status).toBe(200);
  expect((await worker.fetch(new Request(receipt.url), env)).status).toBe(404);
  expect((await worker.fetch(await signed('POST', '/api/results', body), env)).status).toBe(409);
  expect(values.get(`result:${receipt.id}`)).toBe('{"revoked":true}');
});
it('rejects modified bodies, stale signatures, another endpoint and unsafe signed data', async () => {
  const { env, values } = memory(), result = recordedResult(), body = JSON.stringify({ result });
  const original = await signed('POST', '/api/results', body);
  expect((await worker.fetch(new Request(original, { body: body.replace('The Sun is a star.', 'The Sun is cheese.') }), env)).status).toBe(401);
  expect((await worker.fetch(await signed('POST', '/api/results', body, String(Date.now() - 301_000)), env)).status).toBe(401);
  expect((await worker.fetch(new Request(`${origin}/api/results/1234567890`, { method: 'DELETE', headers: original.headers, body }), env)).status).toBe(401);
  const unsafe = structuredClone(result); if (unsafe.type !== 'fact' || !unsafe.sources[0]) throw new Error('Missing source.'); unsafe.sources[0].url = 'javascript:alert(1)';
  expect((await worker.fetch(await signed('POST', '/api/results', JSON.stringify({ result: unsafe })), env)).status).toBe(400);
  unsafe.sources[0].url = result.type === 'fact' ? result.sources[0]!.url : ''; unsafe.explanation = secret;
  expect((await worker.fetch(await signed('POST', '/api/results', JSON.stringify({ result: unsafe })), env)).status).toBe(400);
  expect(values.size).toBe(0);
});
it('escapes user text in page metadata and does not expose a stored expired result', async () => {
  const { env, values } = memory(), result = recordedResult(); result.claim = '<img src=x onerror="alert(1)">';
  const receipt = publicReceiptSchema.parse(await (await worker.fetch(await signed('POST', '/api/results', JSON.stringify({ result })), env)).json());
  const html = await (await worker.fetch(new Request(receipt.url), env)).text(); expect(html).toContain('&lt;img'); expect(html).not.toContain('<img src=x');
  const stored: unknown = JSON.parse(values.get(`result:${receipt.id}`) ?? '');
  if (!stored || typeof stored !== 'object') throw new Error('Missing stored result.');
  values.set(`result:${receipt.id}`, JSON.stringify({ ...stored, expires_at: new Date(Date.now() - 1000).toISOString() }));
  expect((await worker.fetch(new Request(receipt.url), env)).status).toBe(404);
});
it('publishes through Fastify and removes the remote page when the source viewer is purged', async () => {
  const { env } = memory(), db = openDatabase(':memory:'); seedDemo(db, loadDemoCatalog());
  const transport: typeof fetch = async (input, init) => worker.fetch(new Request(input, init), env);
  const app = buildApp({ db, publicOptions: { config: { RESULTS_BASE_URL: origin, RESULTS_SIGNING_KEY: secret }, transport } });
  try {
    const headers = { 'x-dashboard-token': (await app.inject('/api/session')).json<{ csrf_token: string }>().csrf_token };
    const published = await app.inject({ method: 'POST', url: '/api/checks/demo-check-claim-029/publish', headers, payload: {} });
    expect(published.statusCode).toBe(200);
    const address = published.json<{ url: string }>().url; expect((await worker.fetch(new Request(address), env)).status).toBe(200);
    expect(db.prepare('SELECT body_json FROM public_links').get()?.body_json).toBeNull();
    await app.inject({ method: 'POST', url: '/api/history/purge', headers, payload: { user_login: 'demo_viewer_1' } });
    await expect.poll(async () => (await worker.fetch(new Request(address), env)).status).toBe(404);
    expect(db.prepare('SELECT status FROM public_links').get()?.status).toBe('revoked');
    expect((await app.inject({ method: 'POST', url: '/api/checks/demo-check-claim-029/publish', headers, payload: {} })).statusCode).toBe(409);
  } finally { await app.close(); db.close(); }
});
it('does not resurrect a public receipt when its source is purged during the signed upload', async () => {
  const { env, values } = memory(), db = openDatabase(':memory:'); seedDemo(db, loadDemoCatalog());
  let release = () => undefined as void, uploaded = () => undefined as void;
  const held = new Promise<void>((resolve) => { release = resolve; }), arrived = new Promise<void>((resolve) => { uploaded = resolve; });
  const transport: typeof fetch = async (input, init) => {
    const request = new Request(input, init), response = await worker.fetch(request, env);
    if (request.method === 'POST') { uploaded(); await held; }
    return response;
  };
  const app = buildApp({ db, publicOptions: { config: { RESULTS_BASE_URL: origin, RESULTS_SIGNING_KEY: secret }, transport } });
  try {
    const headers = { 'x-dashboard-token': (await app.inject('/api/session')).json<{ csrf_token: string }>().csrf_token };
    const publishing = app.inject({ method: 'POST', url: '/api/checks/demo-check-claim-029/publish', headers, payload: {} }).then((response) => response);
    await arrived; expect(values.size).toBe(1);
    await app.inject({ method: 'POST', url: '/api/history/purge', headers, payload: { user_login: 'demo_viewer_1' } });
    release(); expect((await publishing).statusCode).toBe(409);
    await expect.poll(() => [...values.values()].every((value) => value === '{"revoked":true}')).toBe(true);
    expect(db.prepare('SELECT status,body_json FROM public_links').get()).toMatchObject({ status: 'revoked', body_json: null });
  } finally { release(); await app.close(); db.close(); }
});
it('reports storage outages as temporary failures without accepting invalid data', async () => {
  const { env } = memory(); env.RESULTS.put = async () => { throw new Error('Storage quota reached.'); };
  const body = JSON.stringify({ result: recordedResult() });
  expect((await worker.fetch(await signed('POST', '/api/results', body), env)).status).toBe(503);
  expect((await worker.fetch(await signed('POST', '/api/results', '{}'), env)).status).toBe(400);
});

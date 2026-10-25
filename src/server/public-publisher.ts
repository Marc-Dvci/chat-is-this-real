import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { publicBaseSchema, publicConfigSchema, publicLinkSchema, publicPagesStateSchema, publicReceiptSchema, type PublicLink } from '../shared/schemas.js';
import { publicResultId, signResultRequest } from '../shared/result-signing.js';
import { registerSecrets } from '../shared/secrets.js';
import type { CheckStore } from '../store/check-store.js';
import type { PublicResults } from './public-result.js';

export class PublicPublisher {
  private readonly active = new Map<string, Promise<string>>();
  private readonly stop = new AbortController();
  private readonly secret: string | undefined;
  private readonly base: string | undefined;
  private sweepTask: Promise<void> | undefined;
  private sweepAgain = false;
  private readonly timer: ReturnType<typeof setInterval>;
  constructor(private readonly db: DatabaseSync, private readonly checks: CheckStore, private readonly results: PublicResults,
    options: { disabled?: boolean; config?: unknown; transport?: typeof fetch } = {}) {
    this.transport = options.transport ?? fetch;
    const config = options.disabled ? undefined : publicConfigSchema.safeParse(options.config ?? process.env);
    this.secret = config?.success ? config.data.RESULTS_SIGNING_KEY : undefined;
    this.base = config?.success && config.data.RESULTS_BASE_URL ? new URL(config.data.RESULTS_BASE_URL).origin : undefined;
    if (this.secret) registerSecrets([this.secret]);
    db.exec(`CREATE TABLE IF NOT EXISTS public_links (
      job_id TEXT NOT NULL,result_id TEXT PRIMARY KEY,url TEXT NOT NULL,status TEXT NOT NULL,nonce TEXT NOT NULL,
      body_json TEXT,payload_hash TEXT NOT NULL,base_url TEXT NOT NULL,expires_at TEXT NOT NULL,reason TEXT,last_attempt_ms INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS public_link_job ON public_links(job_id);`);
    this.timer = setInterval(() => this.sweep(), 1000); this.timer.unref();
  }
  private readonly transport: typeof fetch;
  configured(): boolean { return Boolean(this.secret && this.base); }
  private list(): PublicLink[] { return this.db.prepare('SELECT * FROM public_links ORDER BY rowid DESC').all().map((row) => publicLinkSchema.parse(row)); }
  state() { const links = this.list(); return publicPagesStateSchema.parse({ configured: this.configured(), pending_removals: links.filter((link) => link.status === 'revoke_pending').length,
    links: links.map(({ job_id, url, status }) => ({ job_id, url, status })) }); }
  private current(id: string) {
    const job = this.checks.get(id);
    if (!job || !job.input || !['ready', 'on_air'].includes(job.state) || job.reason === 'source_removed') throw new Error('The source check is no longer available for publishing.');
    return job;
  }
  publish(id: string): Promise<string> {
    const pending = this.active.get(id); if (pending) return pending;
    const work = this.publishOne(id).finally(() => { this.active.delete(id); this.sweep(); }); this.active.set(id, work); return work;
  }
  private async request(base: string, method: 'POST' | 'DELETE', path: string, nonce: string, body: string): Promise<Response> {
    if (!this.secret) throw new Error('Connect public result pages first.');
    publicBaseSchema.parse(base);
    const time = String(Date.now()), signature = await signResultRequest(this.secret, method, path, time, nonce, body);
    return this.transport(`${base}${path}`, { method, redirect: 'manual', headers: { 'Content-Type': 'application/json', 'x-results-time': time,
      'x-results-nonce': nonce, 'x-results-signature': signature }, body, signal: AbortSignal.any([this.stop.signal, AbortSignal.timeout(8000)]) });
  }
  private async verifyUrl(url: string): Promise<void> {
    const response = await this.transport(url, { redirect: 'manual', signal: AbortSignal.any([this.stop.signal, AbortSignal.timeout(8000)]) });
    await response.body?.cancel(); if (response.status !== 200) throw new Error('The public page is not available yet. Try again.');
  }
  private async publishOne(id: string): Promise<string> {
    if (!this.secret || !this.base) throw new Error('Connect public result pages before publishing a link.');
    const result = this.results.project(this.current(id)), body = JSON.stringify({ result });
    if (Buffer.byteLength(body) > 262_144) throw new Error('This result is too large for a public page.');
    const hash = createHash('sha256').update(body).digest('hex');
    let link = this.list().find((item) => item.job_id === id && item.payload_hash === hash && item.base_url === this.base && ['pending', 'ready'].includes(item.status) && Date.parse(item.expires_at) > Date.now());
    if (link?.status === 'ready') { await this.verifyUrl(link.url); this.current(id); return link.url; }
    if (!link) {
      const nonce = randomBytes(18).toString('base64url'), resultId = await publicResultId(this.secret, nonce, body);
      link = publicLinkSchema.parse({ job_id: id, result_id: resultId, url: `${this.base}/r/${resultId}`, status: 'pending', nonce, body_json: body,
        payload_hash: hash, base_url: this.base, expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(), reason: null, last_attempt_ms: 0 });
      this.db.prepare('INSERT INTO public_links VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(link.job_id, link.result_id, link.url, link.status, link.nonce, body,
        link.payload_hash, link.base_url, link.expires_at, null, 0);
    }
    try {
      const response = await this.request(link.base_url, 'POST', '/api/results', link.nonce, body);
      if (!response.ok) { await response.body?.cancel(); if (response.status === 409) this.db.prepare("DELETE FROM public_links WHERE result_id=? AND status='pending'").run(link.result_id); throw new Error('Public publishing is temporarily unavailable. Check the site and signing key.'); }
      const receipt = publicReceiptSchema.parse(await response.json());
      if (receipt.id !== link.result_id || receipt.url !== link.url || Date.parse(receipt.expires_at) <= Date.now()) throw new Error('The public site returned an unexpected address.');
      this.current(id);
      await this.verifyUrl(link.url);
      this.current(id);
      const row = this.db.prepare('SELECT status FROM public_links WHERE result_id=?').get(link.result_id);
      if (row?.status !== 'pending') throw new Error('Publication was cancelled.');
      this.db.prepare("UPDATE public_links SET status='ready',body_json=NULL,expires_at=?,reason=NULL,last_attempt_ms=? WHERE result_id=?").run(receipt.expires_at, Date.now(), link.result_id);
      return link.url;
    } catch (error) {
      this.db.prepare("UPDATE public_links SET reason='publish_unavailable',last_attempt_ms=? WHERE result_id=? AND status='pending'").run(Date.now(), link.result_id);
      this.sweep(); throw error;
    }
  }
  revoke(ids: readonly string[]): void {
    for (const id of ids) this.db.prepare("UPDATE public_links SET status='revoke_pending',body_json=NULL,last_attempt_ms=0 WHERE job_id=? AND status<>'revoked'").run(id);
    this.sweep();
  }
  sweep(): void {
    if (this.stop.signal.aborted) return;
    if (this.sweepTask) { this.sweepAgain = true; return; }
    this.sweepTask = this.reconcile().catch(() => undefined).finally(() => { this.sweepTask = undefined; if (this.sweepAgain) { this.sweepAgain = false; this.sweep(); } });
  }
  private async reconcile(): Promise<void> {
    for (const link of this.list()) {
      if (this.stop.signal.aborted) return;
      if (Date.parse(link.expires_at) <= Date.now()) { this.db.prepare('DELETE FROM public_links WHERE result_id=?').run(link.result_id); continue; }
      const job = this.checks.get(link.job_id), unavailable = !job?.input || job.reason === 'source_removed' || link.status === 'pending' && !['ready', 'on_air'].includes(job.state);
      if (unavailable && !['revoked', 'revoke_pending'].includes(link.status)) {
        link.status = 'revoke_pending'; link.last_attempt_ms = 0; this.db.prepare("UPDATE public_links SET status='revoke_pending',body_json=NULL,last_attempt_ms=0 WHERE result_id=?").run(link.result_id);
      }
      if (link.status !== 'revoke_pending' || !this.secret || Date.now() - link.last_attempt_ms < 5000 || this.active.has(link.job_id)) continue;
      this.db.prepare('UPDATE public_links SET last_attempt_ms=? WHERE result_id=?').run(Date.now(), link.result_id);
      try {
        const response = await this.request(link.base_url, 'DELETE', `/api/results/${link.result_id}`, randomBytes(18).toString('base64url'), '{}');
        await response.body?.cancel(); if (!response.ok) throw new Error('Removal unavailable.');
        this.db.prepare("UPDATE public_links SET status='revoked',body_json=NULL,reason=NULL WHERE result_id=?").run(link.result_id);
      } catch { this.db.prepare("UPDATE public_links SET reason='removal_pending' WHERE result_id=?").run(link.result_id); }
    }
  }
  async close(): Promise<void> { clearInterval(this.timer); this.stop.abort(); await this.sweepTask; await Promise.allSettled(this.active.values()); }
}

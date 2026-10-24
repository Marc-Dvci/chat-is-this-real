import type { DatabaseSync } from 'node:sqlite';
import { CheckStore } from '../store/check-store.js';
import { ChatStore } from '../store/chat-store.js';
import { RequestStore } from '../store/request-store.js';
import { CheckEngine } from './engine.js';
import { ModelClient } from '../llm/client.js';
import { loadModelConfig } from '../llm/config.js';
import { SegmentStore } from '../store/segment-store.js';
import { VodEngine } from '../vod/engine.js';
import { type CheckInput, type CheckJob, type CheckRequest, type CheckOutcome, type VodOutcome, type CheckState } from '../shared/schemas.js';

export type CheckReplay = (job: CheckJob, state: (value: CheckState) => void, signal: AbortSignal) => Promise<CheckOutcome | VodOutcome>;

export class CheckService {
  readonly store: CheckStore;
  private readonly chat: ChatStore;
  private readonly requests: RequestStore;
  private readonly pending: string[] = [];
  private active: { id: string; abort: AbortController } | undefined;
  private engine: CheckEngine | undefined;
  private closed = false;
  private drain: Promise<void> | undefined;
  private readonly listeners = new Set<(job: CheckJob) => void>();
  private readonly changed: (job: CheckJob) => void;
  constructor(db: DatabaseSync, changed: (job: CheckJob) => void = () => undefined, private readonly replay?: CheckReplay) {
    this.changed = (job) => { changed(job); for (const listener of this.listeners) listener(job); };
    this.store = new CheckStore(db); this.chat = new ChatStore(db); this.requests = new RequestStore(db);
    db.prepare("UPDATE check_jobs SET state='failed',reason='interrupted' WHERE state IN ('queued','triage','searching','reading','judging')").run();
  }
  subscribe(listener: (job: CheckJob) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  enqueue(request: CheckRequest, channel: CheckInput['channel'] = { title: '', category: '', language: 'en' }): CheckJob {
    const existing = this.store.get(request.id);
    if (existing) return existing;
    const input: CheckInput = { id: request.id, claim: request.body, channel,
      context: request.context_ids.flatMap((id) => { const row = this.chat.get(id); return row?.body ? [{ id, text: row.body }] : []; }) };
    const job = this.store.create(input, request.id, request.kind);
    this.changed(job);
    if (job.state === 'failed') return job;
    if (this.closed || this.pending.length >= 50) {
      this.store.db.prepare("UPDATE check_jobs SET state='failed',reason='queue_full' WHERE id=?").run(job.id);
      const failed = this.store.get(job.id) ?? job; this.changed(failed); return failed;
    }
    this.pending.push(job.id);
    this.kick();
    return job;
  }
  private kick(): void {
    if (this.drain || this.closed || !this.pending.length) return;
    this.drain = Promise.resolve().then(() => this.work()).finally(() => { this.drain = undefined; this.kick(); });
  }
  private async work(): Promise<void> {
    while (this.pending.length && !this.closed) {
      const id = this.pending.shift(); if (!id) break;
      const job = this.store.get(id);
      if (!job?.input || job.reason === 'source_removed' || job.state === 'dismissed') continue;
      const request = job.request_id ? this.requests.get(job.request_id) : undefined;
      if (request?.state === 'cancelled') continue;
      const input = job.input, abort = new AbortController();
      const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(45_000)]);
      this.active = { id, abort };
      try {
        if (this.replay) {
          const outcome = await this.replay(job, (state) => { this.store.state(id, state); const current = this.store.get(id); if (current) this.changed(current); }, signal);
          this.store.finish(id, outcome); continue;
        }
        const engine = this.engine ??= new CheckEngine(new ModelClient(loadModelConfig()), {
          get: (key) => this.store.getCache(key), put: (key, outcome) => this.store.putCache(key, outcome)
        });
        const vod = () => {
          this.store.state(id, 'reading'); const current = this.store.get(id); if (current) this.changed(current);
          return new VodEngine(engine.model, new SegmentStore(this.store.db)).run(id, input.claim, request?.broadcast_id, { signal });
        };
        const outcome = job.kind === 'vod' ? await vod() : await engine.run(input, { signal, onState: (state) => {
          this.store.state(id, state); const current = this.store.get(id); if (current) this.changed(current);
        } });
        this.store.finish(id, outcome.type === 'stream_memory' ? await vod() : outcome);
      } catch {
        this.store.db.prepare("UPDATE check_jobs SET state='failed',reason='model_configuration' WHERE id=? AND reason IS NOT 'source_removed' AND state NOT IN ('dismissed','on_air')").run(id);
      } finally {
        this.active = undefined;
        const current = this.store.get(id); if (current) this.changed(current);
      }
    }
  }
  cancel(ids: readonly string[]): void {
    if (this.active && ids.includes(this.active.id)) this.active.abort.abort();
    for (const id of ids) { const job = this.store.get(id); if (job) this.changed(job); }
  }
  dismiss(id: string): void {
    if (this.active?.id === id) this.active.abort.abort();
    this.store.dismiss(id); const job = this.store.get(id); if (job) this.changed(job);
  }
  async close(): Promise<void> { this.closed = true; this.active?.abort.abort(); await this.drain; }
}

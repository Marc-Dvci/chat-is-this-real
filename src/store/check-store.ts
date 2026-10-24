import type { DatabaseSync } from 'node:sqlite';
import { checkJobRowSchema, checkJobSchema, checkOutcomeSchema, vodOutcomeSchema, type CheckInput, type CheckJob, type CheckOutcome, type CheckState, type VodOutcome } from '../shared/schemas.js';
import { transaction } from './database.js';

export class CheckStore {
  constructor(readonly db: DatabaseSync) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS check_jobs (
        id TEXT PRIMARY KEY, request_id TEXT REFERENCES requests(id) ON DELETE CASCADE,
        kind TEXT NOT NULL, state TEXT NOT NULL, input_json TEXT, outcome_json TEXT,
        reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS check_cache (
        cache_key TEXT PRIMARY KEY, origin_request_id TEXT REFERENCES requests(id) ON DELETE CASCADE,
        outcome_json TEXT NOT NULL, expires_at INTEGER NOT NULL
      ) STRICT;
      CREATE TRIGGER IF NOT EXISTS request_cancel_check AFTER UPDATE OF state ON requests WHEN new.state='cancelled' BEGIN
        UPDATE check_jobs SET input_json=NULL,outcome_json=NULL,state='failed',reason='source_removed',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE request_id=new.id;
        DELETE FROM check_cache WHERE origin_request_id=new.id;
      END;
    `);
  }
  get(id: string): CheckJob | undefined {
    const found = this.db.prepare('SELECT * FROM check_jobs WHERE id=?').get(id);
    if (!found) return undefined;
    const row = checkJobRowSchema.parse(found);
    return checkJobSchema.parse({ ...row, input: row.input_json ? JSON.parse(row.input_json) : null,
      outcome: row.outcome_json ? JSON.parse(row.outcome_json) : null });
  }
  create(input: CheckInput, requestId: string | null = null, kind: 'real' | 'vod' = 'real'): CheckJob {
    const now = new Date().toISOString();
    transaction(this.db, () => {
      const cancelled = requestId && this.db.prepare('SELECT state FROM requests WHERE id=?').get(requestId)?.state === 'cancelled';
      this.db.prepare('INSERT INTO check_jobs VALUES(?,?,?,?,?,NULL,?,?,?)').run(input.id, requestId, kind,
        cancelled ? 'failed' : 'queued', cancelled ? null : JSON.stringify(input), cancelled ? 'source_removed' : null, now, now);
    });
    const created = this.get(input.id); if (!created) throw new Error('Could not store the check.');
    return created;
  }
  state(id: string, state: CheckState): void {
    this.db.prepare("UPDATE check_jobs SET state=?,updated_at=? WHERE id=? AND reason IS NOT 'source_removed' AND state NOT IN ('dismissed','on_air')").run(state, new Date().toISOString(), id);
  }
  finish(id: string, outcome: CheckOutcome | VodOutcome): void {
    const job = this.get(id);
    if (!job || job.reason === 'source_removed' || job.state === 'dismissed' || job.state === 'on_air') return;
    const parsed = outcome.type === 'vod' ? vodOutcomeSchema.parse(outcome) : checkOutcomeSchema.parse(outcome);
    const state = parsed.failed ? 'failed' : parsed.type === 'not_a_claim' ? 'not_a_claim' : 'ready';
    this.db.prepare('UPDATE check_jobs SET outcome_json=?,state=?,reason=?,updated_at=? WHERE id=?').run(JSON.stringify(parsed), state, parsed.reason, new Date().toISOString(), id);
  }
  dismiss(id: string): void {
    this.db.prepare("UPDATE check_jobs SET state='dismissed',updated_at=? WHERE id=?").run(new Date().toISOString(), id);
  }
  list(): CheckJob[] {
    return this.db.prepare('SELECT id FROM check_jobs ORDER BY created_at DESC LIMIT 200').all().map((row) => this.get(String(row.id))).filter((job): job is CheckJob => !!job);
  }
  getCache(key: string): CheckOutcome | undefined {
    this.db.prepare('DELETE FROM check_cache WHERE expires_at<=?').run(Date.now());
    const found = this.db.prepare('SELECT outcome_json FROM check_cache WHERE cache_key=?').get(key);
    return found ? checkOutcomeSchema.parse(JSON.parse(String(found.outcome_json))) : undefined;
  }
  putCache(key: string, outcome: CheckOutcome): void {
    const request = this.db.prepare('SELECT id,state FROM requests WHERE id=?').get(outcome.id);
    if (request?.state === 'cancelled') return;
    this.db.prepare('INSERT INTO check_cache VALUES(?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET origin_request_id=excluded.origin_request_id,outcome_json=excluded.outcome_json,expires_at=excluded.expires_at')
      .run(key, request ? outcome.id : null, JSON.stringify(checkOutcomeSchema.parse(outcome)), Date.now() + 6 * 60 * 60_000);
  }
}

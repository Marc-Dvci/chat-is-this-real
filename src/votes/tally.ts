import type { SqliteStore } from '../store/sqlite.js';
import { scoreSchema, voteSessionSchema, voteViewSchema, type RemovalScope, type StoredMessage, type Verdict } from '../shared/schemas.js';

export class VoteTally {
  constructor(private readonly db: SqliteStore, private readonly now = Date.now) {
    db.exec(`CREATE TABLE IF NOT EXISTS vote_sessions (
      job_id TEXT PRIMARY KEY REFERENCES check_jobs(id) ON DELETE CASCADE,broadcast_id TEXT NOT NULL,
      opened_ms INTEGER NOT NULL,min_until_ms INTEGER NOT NULL,max_until_ms INTEGER NOT NULL,
      ready_ms INTEGER,closed_ms INTEGER,revealed_verdict TEXT,cancelled INTEGER NOT NULL DEFAULT 0
    ) STRICT;
    CREATE TABLE IF NOT EXISTS votes (
      job_id TEXT NOT NULL REFERENCES vote_sessions(job_id) ON DELETE CASCADE,user_id TEXT NOT NULL,
      message_id TEXT NOT NULL UNIQUE,choice INTEGER NOT NULL CHECK(choice IN(1,2)),
      PRIMARY KEY(job_id,user_id)
    ) STRICT;`);
    db.prepare('UPDATE vote_sessions SET cancelled=1,closed_ms=coalesce(closed_ms,?) WHERE revealed_verdict IS NULL').run(this.now());
  }
  open(id: string, broadcast: string, minimumSeconds: number): void {
    const now = this.now(), minimum = Math.max(20, Math.min(60, minimumSeconds)) * 1000;
    this.db.prepare('INSERT OR IGNORE INTO vote_sessions(job_id,broadcast_id,opened_ms,min_until_ms,max_until_ms) VALUES(?,?,?,?,?)').run(id, broadcast, now, now + minimum, now + 60_000);
  }
  get(id: string) {
    const row = this.db.prepare('SELECT * FROM vote_sessions WHERE job_id=?').get(id); if (!row) return undefined;
    const value = voteSessionSchema.parse(row);
    const deadline = value.ready_ms === null ? value.max_until_ms : Math.min(value.max_until_ms, Math.max(value.min_until_ms, value.ready_ms));
    if (!value.closed_ms && this.now() >= deadline) { this.db.prepare('UPDATE vote_sessions SET closed_ms=? WHERE job_id=? AND closed_ms IS NULL').run(deadline, id); value.closed_ms = deadline; }
    return value;
  }
  ready(id: string): void { this.db.prepare('UPDATE vote_sessions SET ready_ms=coalesce(ready_ms,?) WHERE job_id=?').run(this.now(), id); this.get(id); }
  vote(message: StoredMessage): boolean {
    const choice = message.body?.trim(); if (choice !== '1' && choice !== '2' || message.removed_reason) return false;
    const active = this.db.prepare('SELECT job_id FROM vote_sessions WHERE broadcast_id=? AND cancelled=0 AND closed_ms IS NULL ORDER BY opened_ms DESC LIMIT 1').get(message.broadcast_id);
    if (!active) return false;
    const session = this.get(String(active.job_id)), timestamp = Date.parse(message.created_at);
    if (!session || session.closed_ms !== null || session.cancelled || timestamp < session.opened_ms || timestamp > this.now() + 5000) return false;
    return Boolean(this.db.prepare('INSERT OR IGNORE INTO votes VALUES(?,?,?,?)').run(session.job_id, message.user_id, message.id, Number(choice)).changes);
  }
  reveal(id: string, verdict: Verdict): void {
    const session = this.get(id); if (!session || session.cancelled || session.closed_ms === null) return;
    this.db.prepare('UPDATE vote_sessions SET revealed_verdict=? WHERE job_id=? AND revealed_verdict IS NULL').run(verdict, id);
  }
  cancel(id: string): void { this.db.prepare('UPDATE vote_sessions SET cancelled=1,closed_ms=coalesce(closed_ms,?) WHERE job_id=? AND revealed_verdict IS NULL').run(this.now(), id); }
  view(id: string) {
    const session = this.get(id); if (!session || session.cancelled) return null;
    const rows = this.db.prepare('SELECT choice,count(*) AS total FROM votes WHERE job_id=? GROUP BY choice').all(id);
    return voteViewSchema.parse({ job_id: id, real: Number(rows.find((row) => row.choice === 1)?.total ?? 0), not_real: Number(rows.find((row) => row.choice === 2)?.total ?? 0),
      closes_at: new Date(session.ready_ms === null ? session.max_until_ms : Math.min(session.max_until_ms, Math.max(session.min_until_ms, session.ready_ms))).toISOString(),
      closed: session.closed_ms !== null, revealed: session.revealed_verdict !== null,
      no_call: session.revealed_verdict !== null && !['real', 'not_real'].includes(session.revealed_verdict) });
  }
  scores(broadcast: string) {
    return this.db.prepare(`SELECT votes.user_id,count(*) AS points FROM votes JOIN vote_sessions USING(job_id)
      WHERE vote_sessions.broadcast_id=? AND cancelled=0 AND ((revealed_verdict='real' AND choice=1) OR (revealed_verdict='not_real' AND choice=2))
      GROUP BY votes.user_id ORDER BY points DESC,votes.user_id LIMIT 10`).all(broadcast).map((row) => scoreSchema.parse(row));
  }
  remove(scope: RemovalScope): void {
    if (scope.type === 'user') this.db.prepare('DELETE FROM votes WHERE user_id=?').run(scope.id);
    else if (scope.type === 'message') this.db.prepare('DELETE FROM votes WHERE message_id=?').run(scope.id);
    else { this.db.prepare('DELETE FROM votes WHERE job_id IN(SELECT job_id FROM vote_sessions WHERE broadcast_id=?)').run(scope.id); this.db.prepare('UPDATE vote_sessions SET cancelled=1 WHERE broadcast_id=?').run(scope.id); }
  }
}

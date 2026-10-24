import type { DatabaseSync } from 'node:sqlite';
import { broadcastSchema, transcriptSegmentSchema, type Broadcast, type TranscriptCoverage, type TranscriptSegment } from '../shared/schemas.js';
import { queryTerms } from '../vod/numbers.js';
import { transaction } from './database.js';

export class SegmentStore {
  constructor(readonly db: DatabaseSync) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS broadcasts (id TEXT PRIMARY KEY,vod_id TEXT,title TEXT NOT NULL,started_at TEXT NOT NULL,source TEXT NOT NULL,created_at TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS segments (id TEXT PRIMARY KEY,broadcast_id TEXT NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,offset_s REAL NOT NULL,duration_s REAL NOT NULL,text TEXT NOT NULL,data_json TEXT NOT NULL) STRICT;
      CREATE INDEX IF NOT EXISTS segment_broadcast ON segments(broadcast_id,offset_s);
      CREATE TABLE IF NOT EXISTS transcript_windows (broadcast_id TEXT NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,start_s REAL NOT NULL,end_s REAL NOT NULL,PRIMARY KEY(broadcast_id,start_s)) STRICT;
      CREATE VIRTUAL TABLE IF NOT EXISTS segment_fts USING fts5(text,content='segments',content_rowid='rowid',tokenize='unicode61');
      CREATE TRIGGER IF NOT EXISTS segments_insert AFTER INSERT ON segments BEGIN INSERT INTO segment_fts(rowid,text) VALUES(new.rowid,new.text); END;
      CREATE TRIGGER IF NOT EXISTS segments_delete AFTER DELETE ON segments BEGIN INSERT INTO segment_fts(segment_fts,rowid,text) VALUES('delete',old.rowid,old.text); END;
    `);
  }
  register(value: Broadcast): void {
    const item = broadcastSchema.parse(value);
    this.db.prepare('INSERT INTO broadcasts VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET vod_id=coalesce(excluded.vod_id,broadcasts.vod_id),title=excluded.title')
      .run(item.id, item.vod_id, item.title, item.started_at, item.source, item.created_at);
  }
  broadcast(id: string): Broadcast | undefined {
    const row = this.db.prepare('SELECT * FROM broadcasts WHERE id=?').get(id);
    return row ? broadcastSchema.parse(row) : undefined;
  }
  broadcasts(): Broadcast[] { return this.db.prepare('SELECT * FROM broadcasts ORDER BY started_at DESC LIMIT 100').all().map((row) => broadcastSchema.parse(row)); }
  put(input: TranscriptSegment): void {
    const value = transcriptSegmentSchema.parse(input);
    if (value.words.some((word) => word.end_time < word.begin_time || word.end_time > value.duration_s * 1000 + 500)) throw new Error('Invalid transcript word times.');
    this.db.prepare('INSERT INTO segments VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').run(value.id, value.broadcast_id, value.offset_s, value.duration_s, value.text, JSON.stringify(value));
    this.cover(value.broadcast_id, value.offset_s, value.offset_s + value.duration_s);
  }
  cover(broadcastId: string, start: number, end: number): void {
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) throw new Error('Invalid transcript coverage.');
    this.db.prepare('INSERT INTO transcript_windows VALUES(?,?,?) ON CONFLICT(broadcast_id,start_s) DO UPDATE SET end_s=max(end_s,excluded.end_s)').run(broadcastId, start, end);
  }
  all(broadcastId: string): TranscriptSegment[] {
    const broadcast = this.broadcast(broadcastId);
    return this.db.prepare('SELECT data_json FROM segments WHERE broadcast_id=? ORDER BY offset_s,id').all(broadcastId)
      .map((row) => ({ ...transcriptSegmentSchema.parse(JSON.parse(String(row.data_json))), vod_id: broadcast?.vod_id ?? null }));
  }
  candidates(broadcastId: string, question: string): TranscriptSegment[] {
    const all = this.all(broadcastId);
    if (all.length <= 720 && all.reduce((size, segment) => size + segment.text.length, 0) <= 80_000) return all;
    const terms = queryTerms(question);
    if (!terms.length) return [];
    const matches = this.db.prepare(`SELECT segments.id FROM segment_fts JOIN segments ON segments.rowid=segment_fts.rowid
      WHERE segment_fts MATCH ? AND broadcast_id=? ORDER BY bm25(segment_fts) LIMIT 40`).all(terms.map((term) => `"${term}"`).join(' OR '), broadcastId);
    const ids = new Set(matches.flatMap((row) => { const index = all.findIndex((item) => item.id === row.id); return all.slice(Math.max(0, index - 1), index + 2).map((item) => item.id); }));
    return all.filter((segment) => ids.has(segment.id));
  }
  coverage(broadcastId: string): TranscriptCoverage {
    const ranges = this.db.prepare('SELECT start_s,end_s FROM transcript_windows WHERE broadcast_id=? ORDER BY start_s').all(broadcastId);
    let start = 0, end = 0;
    const gaps: TranscriptCoverage['gaps'] = [];
    ranges.forEach((range, index) => {
      const next = Number(range.start_s), finish = Number(range.end_s);
      if (!index) start = next;
      else if (next > end + 0.05) gaps.push({ start_s: end, end_s: next });
      end = Math.max(end, finish);
    });
    return { broadcast_id: broadcastId, start_s: start, end_s: end, gaps,
      segment_count: Number(this.db.prepare('SELECT count(*) AS total FROM segments WHERE broadcast_id=?').get(broadcastId)?.total ?? 0) };
  }
  remove(id: string): void { transaction(this.db, () => { this.db.prepare('DELETE FROM broadcasts WHERE id=?').run(id); }); }
}

import type { SqliteStore, SQLInputValue } from './sqlite.js';
import { chatDbRowSchema, storedMessageSchema, type StoredMessage } from '../shared/schemas.js';
import { transaction } from './sqlite.js';

function message(row: unknown): StoredMessage | undefined {
  if (!row) return undefined;
  const parsed = chatDbRowSchema.parse(row);
  return storedMessageSchema.parse({ ...parsed, badges: JSON.parse(parsed.badges_json) });
}

export class ChatStore {
  constructor(readonly db: SqliteStore) {}

  get(id: string): StoredMessage | undefined { return message(this.db.prepare('SELECT * FROM messages WHERE id=?').get(id)); }

  suppressed(value: StoredMessage, snapshot = false): boolean {
    if (this.get(value.id)?.removed_reason) return true;
    const clear = this.db.prepare("SELECT cleared_at FROM moderation_watermarks WHERE (user_id=? OR (user_id='*' AND broadcast_id=?)) ORDER BY cleared_at DESC LIMIT 1")
      .get(value.user_id, value.broadcast_id);
    return Boolean(clear && (snapshot || String(clear.cleared_at) >= value.created_at));
  }

  put(input: StoredMessage, snapshot = false): StoredMessage | undefined {
    const value = storedMessageSchema.parse(input);
    const existing = this.get(value.id);
    if (existing?.removed_reason) return existing;
    const clear = this.db.prepare("SELECT cleared_at FROM moderation_watermarks WHERE (user_id=? OR (user_id='*' AND broadcast_id=?)) ORDER BY cleared_at DESC LIMIT 1")
      .get(value.user_id, value.broadcast_id);
    if (clear && (snapshot || String(clear.cleared_at) >= value.created_at)) return undefined;
    this.db.prepare(`INSERT INTO messages(id,broadcast_id,user_id,user_login,display_name,body,badges_json,parent_id,created_at,scope,removed_reason)
      VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`).run(value.id, value.broadcast_id, value.user_id, value.user_login,
      value.display_name, value.body, JSON.stringify(value.badges), value.parent_id, value.created_at, value.scope, value.removed_reason);
    return this.get(value.id);
  }

  list(userId?: string, streamId?: string, query = '', limit = 100): StoredMessage[] {
    const tokens = query.slice(0, 200).match(/[\p{L}\p{N}]+/gu) ?? [];
    if (query.trim() && !tokens.length) return [];
    const search = tokens.map((token) => `"${token}"`).join(' AND ');
    const rows = this.db.prepare(`SELECT messages.* FROM messages ${search ? 'JOIN message_fts ON message_fts.rowid=messages.rowid' : ''}
      WHERE scope='history' AND (? IS NULL OR user_id=?) AND (? IS NULL OR broadcast_id=?) ${search ? 'AND message_fts MATCH ?' : ''}
      ORDER BY created_at DESC,id DESC LIMIT ?`).all(userId ?? null, userId ?? null, streamId ?? null, streamId ?? null,
      ...(search ? [search] : []), Math.min(200, Math.max(1, limit)));
    return rows.map((row) => message(row)).filter((row): row is StoredMessage => !!row);
  }

  recent(userId: string, before: string, exclude: readonly string[] = []): StoredMessage[] {
    const since = new Date(Date.parse(before) - 10 * 60_000).toISOString();
    return this.db.prepare("SELECT * FROM messages WHERE scope='history' AND user_id=? AND created_at<? AND created_at>=? AND body IS NOT NULL ORDER BY created_at DESC LIMIT 20")
      .all(userId, before, since).map((row) => message(row)).filter((row): row is StoredMessage => !!row && !exclude.includes(row.id)).slice(0, 5).reverse();
  }
  context(id: string): StoredMessage[] {
    const anchor = this.get(id); if (!anchor) return [];
    const before = this.db.prepare('SELECT * FROM messages WHERE broadcast_id=? AND created_at<=? AND id<>? ORDER BY created_at DESC LIMIT 10').all(anchor.broadcast_id, anchor.created_at, id);
    const after = this.db.prepare('SELECT * FROM messages WHERE broadcast_id=? AND created_at>? ORDER BY created_at LIMIT 10').all(anchor.broadcast_id, anchor.created_at);
    return [...before.reverse(), anchor, ...after].map((row) => 'badges' in row ? row as StoredMessage : message(row)).filter((row): row is StoredMessage => !!row);
  }

  private redact(where: string, values: readonly SQLInputValue[], reason: 'moderation' | 'user_request'): string[] {
    const affected = this.db.prepare(`SELECT id FROM requests WHERE id IN (
      SELECT request_id FROM request_messages JOIN messages ON messages.id=request_messages.message_id WHERE ${where})`).all(...values)
      .map((row) => String(row.id));
    this.db.prepare(`UPDATE requests SET body='',context_ids_json='[]',state='cancelled' WHERE id IN (
      SELECT request_id FROM request_messages JOIN messages ON messages.id=request_messages.message_id WHERE ${where})`).run(...values);
    this.db.prepare(`UPDATE messages SET body=NULL,removed_reason=? WHERE ${where}`).run(reason, ...values);
    return affected;
  }

  deleteMessage(id: string, broadcastId: string, at: string): string[] {
    return transaction(this.db, () => {
      if (!this.get(id)) this.put({ id, broadcast_id: broadcastId, user_id: '', user_login: '', display_name: '', body: null,
        badges: [], parent_id: null, created_at: at, scope: 'check', removed_reason: 'moderation' });
      return this.redact('messages.id=?', [id], 'moderation');
    });
  }

  clearUser(userId: string, broadcastId: string, at: string, reason: 'moderation' | 'user_request' = 'moderation'): string[] {
    return transaction(this.db, () => {
      this.db.prepare(`INSERT INTO moderation_watermarks VALUES(?,?,?) ON CONFLICT(broadcast_id,user_id)
        DO UPDATE SET cleared_at=max(cleared_at,excluded.cleared_at)`).run(broadcastId, userId, at);
      return this.redact('messages.user_id=?', [userId], reason);
    });
  }

  clearStream(streamId: string, at: string): string[] {
    return transaction(this.db, () => {
      this.db.prepare(`INSERT INTO moderation_watermarks VALUES(?,?,?) ON CONFLICT(broadcast_id,user_id)
        DO UPDATE SET cleared_at=max(cleared_at,excluded.cleared_at)`).run(streamId, '*', at);
      return this.redact('messages.broadcast_id=?', [streamId], 'moderation');
    });
  }

  purge(days: number, now = Date.now()): void {
    const cutoff = new Date(now - Math.max(1, days) * 86_400_000).toISOString();
    transaction(this.db, () => {
      this.redact('messages.created_at<?', [cutoff], 'user_request');
      this.db.prepare('DELETE FROM messages WHERE created_at<?').run(cutoff);
      this.db.prepare('DELETE FROM requests WHERE created_at<?').run(cutoff);
      this.db.prepare('DELETE FROM moderation_watermarks WHERE cleared_at<?').run(cutoff);
    });
  }
}

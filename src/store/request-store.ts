import type { DatabaseSync } from 'node:sqlite';
import { checkRequestSchema, requestDbRowSchema, type CheckRequest } from '../shared/schemas.js';
import { transaction } from './database.js';

export class RequestStore {
  constructor(readonly db: DatabaseSync) {}
  byCommand(id: string): CheckRequest | undefined {
    const row = this.db.prepare("SELECT id FROM requests WHERE command_message_id=? AND source='chat'").get(id);
    return row ? this.get(String(row.id)) : undefined;
  }
  get(id: string): CheckRequest | undefined {
    const found = this.db.prepare('SELECT * FROM requests WHERE id=?').get(id);
    if (!found) return undefined;
    const row = requestDbRowSchema.parse(found);
    return checkRequestSchema.parse({ ...row, context_ids: JSON.parse(row.context_ids_json), source_message_ids: JSON.parse(row.source_ids_json) });
  }
  put(input: CheckRequest): CheckRequest {
    const request = checkRequestSchema.parse(input);
    return transaction(this.db, () => {
      this.db.prepare(`INSERT INTO requests VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(request.id, request.kind, request.body,
        request.broadcast_id, request.author_user_id, request.original_message_id, request.command_message_id,
        JSON.stringify(request.context_ids), JSON.stringify(request.source_message_ids), request.created_at, request.state, request.source);
      for (const id of new Set([...request.source_message_ids, ...request.context_ids])) {
        this.db.prepare('INSERT INTO request_messages VALUES(?,?)').run(request.id, id);
      }
      return request;
    });
  }
  list(): CheckRequest[] {
    return this.db.prepare('SELECT id FROM requests ORDER BY created_at DESC LIMIT 200').all()
      .map((row) => this.get(String(row.id))).filter((request): request is CheckRequest => !!request);
  }
}

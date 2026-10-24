import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDatabase(path = 'data/chat.db'): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys=ON;
    PRAGMA journal_mode=WAL;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, broadcast_id TEXT NOT NULL, user_id TEXT NOT NULL,
      user_login TEXT NOT NULL, display_name TEXT NOT NULL, body TEXT,
      badges_json TEXT NOT NULL, parent_id TEXT, created_at TEXT NOT NULL,
      scope TEXT NOT NULL, removed_reason TEXT
    ) STRICT;
    CREATE INDEX IF NOT EXISTS messages_viewer ON messages(user_id,created_at);
    CREATE INDEX IF NOT EXISTS messages_stream ON messages(broadcast_id,created_at);
    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, body TEXT NOT NULL, broadcast_id TEXT NOT NULL,
      author_user_id TEXT NOT NULL, original_message_id TEXT NOT NULL, command_message_id TEXT NOT NULL,
      context_ids_json TEXT NOT NULL, source_ids_json TEXT NOT NULL, created_at TEXT NOT NULL,
      state TEXT NOT NULL, source TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS request_messages (
      request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      PRIMARY KEY(request_id,message_id)
    ) STRICT;
    CREATE UNIQUE INDEX IF NOT EXISTS requests_command ON requests(command_message_id) WHERE source='chat';
    CREATE TABLE IF NOT EXISTS publications (
      request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE, kind TEXT NOT NULL,
      status TEXT NOT NULL, message_id TEXT, reason TEXT,
      PRIMARY KEY(request_id,kind)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value_json TEXT NOT NULL) STRICT;
    CREATE TABLE IF NOT EXISTS moderation_watermarks (
      broadcast_id TEXT NOT NULL, user_id TEXT NOT NULL, cleared_at TEXT NOT NULL,
      PRIMARY KEY(broadcast_id,user_id)
    ) STRICT;
    CREATE VIRTUAL TABLE IF NOT EXISTS message_fts USING fts5(body,content='messages',content_rowid='rowid',tokenize='unicode61');
    CREATE TRIGGER IF NOT EXISTS messages_insert AFTER INSERT ON messages BEGIN
      INSERT INTO message_fts(rowid,body) VALUES(new.rowid,new.body);
    END;
    CREATE TRIGGER IF NOT EXISTS messages_delete AFTER DELETE ON messages BEGIN
      INSERT INTO message_fts(message_fts,rowid,body) VALUES('delete',old.rowid,old.body);
    END;
    CREATE TRIGGER IF NOT EXISTS messages_update AFTER UPDATE OF body ON messages BEGIN
      INSERT INTO message_fts(message_fts,rowid,body) VALUES('delete',old.rowid,old.body);
      INSERT INTO message_fts(rowid,body) VALUES(new.rowid,new.body);
    END;
  `);
  return db;
}

export function transaction<T>(db: DatabaseSync, operation: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try { const result = operation(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}

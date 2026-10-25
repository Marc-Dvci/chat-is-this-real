import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { initializeDatabase } from './schema.js';
export { transaction } from './sqlite.js';

export function openDatabase(path = 'data/chat.db'): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  initializeDatabase(db); return db;
}

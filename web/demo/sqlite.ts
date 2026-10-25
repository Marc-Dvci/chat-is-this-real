import init, { type SqlValue, type PreparedStatement } from '@sqlite.org/sqlite-wasm';
import type { SQLOutputValue } from 'node:sqlite';
import type { SqliteStore, SQLInputValue } from '../../src/store/sqlite.js';
import { initializeDatabase } from '../../src/store/schema.js';

function input(value: SQLInputValue): SqlValue {
  return ArrayBuffer.isView(value) ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength) : value;
}
function row(statement: PreparedStatement): Record<string, SQLOutputValue> {
  return Object.fromEntries(Object.entries(statement.get({})).map(([key, value]) => [key,
    typeof value === 'object' && value !== null ? Uint8Array.from(value instanceof ArrayBuffer ? new Uint8Array(value) : value) : value]));
}
export async function openBrowserDatabase(): Promise<SqliteStore> {
  const sqlite = await init(), db = new sqlite.oo1.DB(':memory:', 'c');
  const store: SqliteStore = {
    exec: (sql) => { db.exec(sql); },
    prepare: (sql) => {
      const statement = <T>(values: SQLInputValue[], action: (value: PreparedStatement) => T): T => {
        const prepared = db.prepare(sql);
        try { if (values.length) prepared.bind(values.map(input)); return action(prepared); } finally { prepared.finalize(); }
      };
      return {
        get: (...values) => statement(values, (value) => value.step() ? row(value) : undefined),
        all: (...values) => statement(values, (value) => { const rows = []; while (value.step()) rows.push(row(value)); return rows; }),
        run: (...values) => statement(values, (value) => { value.step(); const last = db.selectValue('SELECT last_insert_rowid()'); return { changes: db.changes(), lastInsertRowid: typeof last === 'number' || typeof last === 'bigint' ? last : 0 }; })
      };
    }
  };
  initializeDatabase(store); return store;
}

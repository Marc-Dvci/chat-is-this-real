import type { SQLInputValue, SQLOutputValue } from 'node:sqlite';
export type { SQLInputValue } from 'node:sqlite';

export interface SqliteStore {
  exec(sql: string): void;
  prepare(sql: string): {
    get(...values: SQLInputValue[]): Record<string, SQLOutputValue> | undefined;
    all(...values: SQLInputValue[]): Record<string, SQLOutputValue>[];
    run(...values: SQLInputValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  };
}

export function transaction<T>(db: SqliteStore, operation: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try { const result = operation(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}

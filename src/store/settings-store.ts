import type { DatabaseSync } from 'node:sqlite';
import { chatEnvironmentSchema, chatSettingsSchema, type ChatSettings } from '../shared/schemas.js';

export class SettingsStore {
  constructor(readonly db: DatabaseSync) {}
  get(): ChatSettings {
    const row = this.db.prepare("SELECT value_json FROM settings WHERE key='chat'").get();
    return chatSettingsSchema.parse(row ? JSON.parse(String(row.value_json)) : {
      retention_days: chatEnvironmentSchema.parse(process.env).CHAT_RETENTION_DAYS
    });
  }
  set(input: ChatSettings): ChatSettings {
    const value = chatSettingsSchema.parse(input);
    this.db.prepare("INSERT INTO settings VALUES('chat',?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json").run(JSON.stringify(value));
    return value;
  }
}

import type { SqliteStore } from './sqlite.js';
import { chatEnvironmentSchema, chatSettingsSchema, type ChatSettings } from '../shared/schemas.js';

export class SettingsStore {
  constructor(readonly db: SqliteStore) {}
  get(): ChatSettings {
    const environment = typeof process === 'undefined' ? {} : process.env;
    const platform = typeof process === 'undefined' ? 'browser' : process.platform;
    const row = this.db.prepare("SELECT value_json FROM settings WHERE key='chat'").get();
    return chatSettingsSchema.parse({
      retention_days: chatEnvironmentSchema.parse(environment).CHAT_RETENTION_DAYS,
      audio_input_format: environment.AUDIO_INPUT_FORMAT ?? (platform === 'win32' ? 'dshow' : platform === 'darwin' ? 'avfoundation' : 'pulse'),
      audio_device: environment.AUDIO_DEVICE ?? '', asr_language: environment.ASR_LANGUAGE ?? 'en',
      ...(row ? JSON.parse(String(row.value_json)) as Record<string, unknown> : {})
    });
  }
  set(input: ChatSettings): ChatSettings {
    const value = chatSettingsSchema.parse(input);
    this.db.prepare("INSERT INTO settings VALUES('chat',?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json").run(JSON.stringify(value));
    return value;
  }
}

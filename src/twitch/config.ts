import { loadLocalEnv } from '../shared/env.js';
import { twitchConfigSchema, type TwitchConfig } from '../shared/schemas.js';

export function loadTwitchConfig(): TwitchConfig {
  loadLocalEnv();
  const result = twitchConfigSchema.safeParse(process.env);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.') || 'account configuration'))];
    throw new Error(`Complete the Twitch settings in .env: ${fields.join(', ')}.`);
  }
  return result.data;
}

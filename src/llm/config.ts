import { loadLocalEnv } from '../shared/env.js';
import { modelConfigSchema, type ModelConfig } from '../shared/schemas.js';

export function loadModelConfig(): ModelConfig {
  loadLocalEnv();
  const parsed = modelConfigSchema.safeParse(process.env);
  if (!parsed.success) throw new Error('Complete the Model Studio settings in .env.');
  const url = new URL(parsed.data.MODELSTUDIO_BASE_URL);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error('Use a secure Model Studio endpoint without URL credentials.');
  }
  return { ...parsed.data, MODELSTUDIO_BASE_URL: parsed.data.MODELSTUDIO_BASE_URL.replace(/\/$/, '') };
}

import { readFile } from 'node:fs/promises';
import { engineConfigSchema, modelUsageSchema } from '../shared/schemas.js';
import { ModelProviderError } from './errors.js';

export async function requireLocalAllowance(model: string, reserveAudioSeconds = 0): Promise<void> {
  let raw = '';
  try { raw = await readFile('data/llm/usage.jsonl', 'utf8'); }
  catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw new ModelProviderError('quota', 'usage_ledger_unavailable');
  }
  let used = 0, audioSeconds = 0;
  for (const line of raw.split(/\r?\n/u).filter(Boolean)) {
    let value: unknown;
    try { value = JSON.parse(line); }
    catch { throw new ModelProviderError('quota', 'usage_ledger_invalid'); }
    const parsed = modelUsageSchema.safeParse(value);
    if (!parsed.success) throw new ModelProviderError('quota', 'usage_ledger_invalid');
    if (parsed.data.model === model) {
      const tokens = parsed.data.input_tokens + parsed.data.output_tokens;
      used += tokens || (parsed.data.status === 'error' ? 32_000 : 0);
      audioSeconds += parsed.data.audio_seconds || (parsed.data.status === 'error' ? 16 : 0);
    }
  }
  const config = engineConfigSchema.parse(process.env);
  if (used + 32_000 > config.MODELSTUDIO_TOKEN_LIMIT) throw new ModelProviderError('quota', 'local_token_limit');
  if (reserveAudioSeconds && audioSeconds + reserveAudioSeconds > config.MODELSTUDIO_ASR_SECONDS_LIMIT) throw new ModelProviderError('quota', 'local_audio_limit');
}

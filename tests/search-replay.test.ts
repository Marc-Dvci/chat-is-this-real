import { expect, it } from 'vitest';
import { replaySearch } from '../src/check/search-replay.js';
import { ModelClient } from '../src/llm/client.js';
import { modelConfigSchema } from '../src/shared/schemas.js';

it('returns recorded search URLs for the explicit probe claim and no result for an unknown claim', async () => {
  const result = await replaySearch("The Moon is Earth's only natural satellite.");
  expect(result.origin).toBe('host_web_search_curated');
  expect(result.searchCalls).toBe(0);
  expect(result.sources.some((source) => source.url === 'https://science.nasa.gov/moon/facts/')).toBe(true);
  expect((await replaySearch('An unrecorded claim about a puzzle.')).matched).toBe(false);
  expect((await replaySearch('An unrecorded claim about a puzzle.')).sources).toEqual([]);
});

it('blocks paid search before attempting any network request', async () => {
  const config = modelConfigSchema.parse({ DASHSCOPE_API_KEY: 'unused-test-credential', MODELSTUDIO_BASE_URL: 'https://example.invalid/v1' });
  const client = new ModelClient(config);
  await expect(client.search(config.MODEL_SEARCH, { claim: 'test' })).rejects.toMatchObject({ code: 'paid_search_disabled' });
  expect(client.calls).toEqual([]);
});

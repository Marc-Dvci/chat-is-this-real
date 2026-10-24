import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { availabilitySchema, nativeAsrSchema, providerChatSchema } from '../src/shared/schemas.js';

it('accepts the recorded strict-output response without assuming optional reasoning fields', async () => {
  const fixture: { response: unknown } = JSON.parse(await readFile('fixtures/models/availability.json', 'utf8'));
  const response = providerChatSchema.parse(fixture.response);
  expect(availabilitySchema.parse(JSON.parse(response.choices[0]?.message.content ?? 'null'))).toEqual({ ok: true });
  expect(response.usage?.completion_tokens).toBeGreaterThan(0);
});

it('reads text, usage and word times from the real native ASR response envelope', async () => {
  const fixture: { response: unknown } = JSON.parse(await readFile('fixtures/models/native-asr.json', 'utf8'));
  const response = nativeAsrSchema.parse(fixture.response);
  expect(response.output.text).toContain('blue robot puzzle');
  expect(response.usage?.input_tokens).toBeGreaterThan(0);
  const words = response.output.sentence?.words ?? [];
  expect(words.length).toBeGreaterThan(0);
  expect(words.every((word) => word.end_time >= word.begin_time)).toBe(true);
});

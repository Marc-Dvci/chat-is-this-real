import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { sourceDocumentSchema } from '../src/shared/schemas.js';
import { sourceWindow, verifyEvidence } from '../src/check/verify.js';
import { normalizeText } from '../src/shared/text-normalize.js';

it('keeps only excerpts found in the real recorded source window', async () => {
  const source = sourceDocumentSchema.parse(JSON.parse(await readFile('fixtures/sources/moon-window.json', 'utf8')));
  const verified = verifyEvidence([
    { source_id: source.id, excerpt: source.text.replaceAll(' ', '\u00a0'), stance: 'supports' },
    { source_id: source.id, excerpt: 'There are two bright rings around the Moon at all times.', stance: 'supports' },
    { source_id: 'foreign-source', excerpt: source.text, stance: 'contradicts' }
  ], [source]);
  expect(verified.verified).toHaveLength(1);
  expect(verified.verified[0]?.source_id).toBe(source.id);
  expect(verified.dropped).toBe(2);
});

it('normalizes case, compatibility characters, quotes, dashes and whitespace consistently', () => {
  expect(normalizeText(' “Ａ Claim”\u00a0– ‘Test’\n')).toBe('"a claim" - \'test\'');
});

it('selects a relevant later passage without letting repeated generic terms dominate', async () => {
  const source = sourceDocumentSchema.parse(JSON.parse(await readFile('fixtures/sources/moon-window.json', 'utf8')));
  const text = `${'Moon overview and Moon introduction. '.repeat(400)}${source.text}${' General material. '.repeat(400)}`;
  const selected = sourceWindow(text, ['Moon average distance kilometers']);
  expect(selected).toContain(source.text);
  expect(selected.length).toBeLessThanOrEqual(6000);
  expect(sourceWindow(text, [], 250)).toHaveLength(250);
});

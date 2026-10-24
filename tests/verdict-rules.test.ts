import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { decideVerdict } from '../src/check/verdict-rules.js';
import { evaluateProposal } from '../src/check/proposal.js';
import { sourceDocumentSchema, type Evidence } from '../src/shared/schemas.js';

const evidence = (stances: Evidence['stance'][]): Evidence[] => stances.map((stance) => ({ source_id: 'verified-source', excerpt: 'An already verified excerpt supplied to the deterministic rule.', stance }));
it.each([
  ['real', [], 'unconfirmed'], ['not_real', [], 'unconfirmed'], ['missing_context', [], 'unconfirmed'],
  ['real', ['supports'], 'real'], ['not_real', ['supports'], 'real'],
  ['not_real', ['contradicts'], 'not_real'], ['real', ['contradicts'], 'not_real'],
  ['real', ['supports', 'contradicts'], 'missing_context'], ['not_real', ['supports', 'contradicts'], 'missing_context'],
  ['missing_context', ['supports'], 'missing_context'], ['missing_context', ['context'], 'missing_context'],
  ['real', ['context'], 'unconfirmed'], ['unconfirmed', ['supports'], 'real'],
  ['unconfirmed', ['contradicts'], 'not_real'], ['invented', ['supports'], 'real'], ['invented', [], 'unconfirmed']
] as const)('applies the evidence table to %s and %j', (proposed, stances, expected) => {
  expect(decideVerdict(proposed, evidence([...stances]))).toBe(expected);
});

it('drops a fabricated excerpt against the real captured page and downgrades REAL', async () => {
  const source = sourceDocumentSchema.parse(JSON.parse(await readFile('fixtures/sources/moon-window.json', 'utf8')));
  const result = evaluateProposal({ verdict: 'real', explanation: 'An adversarial proposal to test verification.', evidence: [
    { source_id: source.id, excerpt: 'The Moon is covered by a bright green ocean made of jelly.', stance: 'supports' }
  ] }, [source]);
  expect(result).toMatchObject({ model_verdict: 'real', final_verdict: 'unconfirmed', dropped_excerpts: 1, evidence: [] });
});

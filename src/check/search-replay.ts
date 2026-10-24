import { readFile } from 'node:fs/promises';
import { searchReplaySchema } from '../shared/schemas.js';
import { normalizeText } from '../shared/text-normalize.js';
import { selectSearchSources } from '../llm/search-sources.js';

export async function replaySearch(claim: string, path = 'fixtures/search/probe.json') {
  const recording = searchReplaySchema.parse(JSON.parse(await readFile(path, 'utf8')));
  const match = recording.items.find((item) => normalizeText(item.claim) === normalizeText(claim));
  return { sources: selectSearchSources(match?.sources ?? []), searchCalls: 0,
    documents: match?.documents ?? [],
    origin: recording.origin, recorded_at: recording.recorded_at, matched: Boolean(match) };
}

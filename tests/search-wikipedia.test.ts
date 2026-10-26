import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { wikipediaArticleUrl, wikipediaSearch } from '../src/check/search-wikipedia.js';

const recording = JSON.parse(readFileSync(new URL('../fixtures/search/wikipedia.json', import.meta.url), 'utf8')) as {
  responses: { url: string; status: number; body: unknown }[];
  results: { queries: string[]; sources: { url: string; title: string }[] }[];
};
const replay: typeof fetch = async (input) => {
  const match = recording.responses.find((item) => item.url === String(input));
  return match ? Response.json(match.body, { status: match.status }) : new Response('missing', { status: 404 });
};

it('turns recorded Wikimedia search responses into ranked article sources', async () => {
  for (const item of recording.results) {
    const found = await wikipediaSearch(item.queries, undefined, replay);
    expect(found.sources).toEqual(item.sources);
    expect(found.searchCalls).toBe(0);
    expect(found.sources.every((source) => source.url.startsWith('https://en.wikipedia.org/wiki/'))).toBe(true);
  }
});

it('puts each query\'s best page before any second-ranked page', async () => {
  const first = recording.results[0];
  if (!first) throw new Error('Missing recording.');
  const found = await wikipediaSearch(first.queries, undefined, replay);
  expect(found.sources.map((source) => source.title).slice(0, 2)).toEqual(['Artificial structures visible from space', 'Great Wall of China']);
});

it('skips a failed search request and keeps the others', async () => {
  const first = recording.results[0];
  if (!first) throw new Error('Missing recording.');
  const flaky: typeof fetch = async (input, init) => String(input).includes('naked+eye') ? new Response('busy', { status: 503 }) : replay(input, init);
  const found = await wikipediaSearch(first.queries, undefined, flaky);
  expect(found.sources.map((source) => source.title)).toEqual(['Artificial structures visible from space', 'Great Wall of China']);
});

it('stops when the check is cancelled', async () => {
  const controller = new AbortController();
  const hanging: typeof fetch = (_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason)));
  const search = wikipediaSearch(['octopus number of hearts'], controller.signal, hanging);
  controller.abort();
  await expect(search).rejects.toBeDefined();
});

it('encodes article keys without breaking subpage slashes', () => {
  expect(wikipediaArticleUrl('en', 'AC/DC')).toBe('https://en.wikipedia.org/wiki/AC/DC');
  expect(wikipediaArticleUrl('en', 'Pokémon_(video_game_series)')).toBe('https://en.wikipedia.org/wiki/Pok%C3%A9mon_(video_game_series)');
});

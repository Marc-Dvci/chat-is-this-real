import { writeFile } from 'node:fs/promises';
import { wikipediaSearch } from '../src/check/search-wikipedia.js';

// Records real Wikimedia search responses for the discovery tests.
const cases = [
  { queries: ['Great Wall of China visible from space', 'Great Wall naked eye low Earth orbit'] },
  { queries: ['octopus number of hearts'] }
];
const responses: { url: string; status: number; body: unknown }[] = [];
const recorder: typeof fetch = async (input, init) => {
  const response = await fetch(input, init), body: unknown = await response.json();
  responses.push({ url: String(input), status: response.status, body });
  return Response.json(body, { status: response.status });
};
const results = [];
for (const item of cases) results.push({ ...item, sources: (await wikipediaSearch(item.queries, undefined, recorder)).sources });
await writeFile('fixtures/search/wikipedia.json', `${JSON.stringify({ recorded_at: new Date().toISOString(), responses, results }, null, 2)}\n`);
console.info(`Recorded ${responses.length} Wikimedia responses.`);

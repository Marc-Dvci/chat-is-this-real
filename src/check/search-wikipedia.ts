import { wikipediaSearchSchema } from '../shared/schemas.js';
import { selectSearchSources } from '../llm/search-sources.js';

// Wikimedia asks API clients for a descriptive agent with a contact address.
const agent = 'ChatIsThisReal/0.1 (https://github.com/Marc-Dvci/chat-is-this-real)';

export function wikipediaArticleUrl(edition: string, key: string): string {
  return `https://${edition}.wikipedia.org/wiki/${key.split('/').map(encodeURIComponent).join('/')}`;
}

// The search needs no key, so the connected app finds sources at no cost. Triage writes its
// queries in English whatever language chat used, and the judge quotes the source verbatim.
export async function wikipediaSearch(queries: readonly string[], signal?: AbortSignal, transport: typeof fetch = fetch) {
  const edition = 'en';
  const pages = await Promise.all(queries.slice(0, 3).map(async (query) => {
    const address = `https://${edition}.wikipedia.org/w/rest.php/v1/search/page?${new URLSearchParams({ q: query.slice(0, 250), limit: '2' })}`;
    const timeout = AbortSignal.timeout(5000);
    try {
      const response = await transport(address, { headers: { 'User-Agent': agent, Accept: 'application/json' }, redirect: 'error',
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
      if (!response.ok) { await response.body?.cancel(); return []; }
      return wikipediaSearchSchema.parse(await response.json()).pages.map((page) => ({ url: wikipediaArticleUrl(edition, page.key), title: page.title }));
    } catch (error) {
      if (signal?.aborted) throw error;
      return [];
    }
  }));
  // Interleave by rank so each query's best page comes before any second-ranked page.
  const ranked = [0, 1].flatMap((rank) => pages.flatMap((list) => list[rank] ? [list[rank]] : []));
  return { sources: selectSearchSources(ranked).slice(0, 4), searchCalls: 0, documents: [] };
}

import { readFile, writeFile } from 'node:fs/promises';
import { verifyFrozenEngine } from '../eval/freeze.js';
import { searchReplaySchema } from '../src/shared/schemas.js';

await verifyFrozenEngine();
// Only IDs and input messages enter curation. Labels and reference pages stay outside this step.
const inputs: { id: string; message: string }[] = (await readFile('eval/claims.jsonl', 'utf8')).trim().split('\n').flatMap((line) => {
  const raw: unknown = JSON.parse(line);
  if (!raw || typeof raw !== 'object' || !('split' in raw) || raw.split !== 'heldout' || !('id' in raw) || !('message' in raw)
    || typeof raw.id !== 'string' || typeof raw.message !== 'string') return [];
  return [{ id: raw.id, message: raw.message }];
});
const groups = [
  { ids: ['001', '002'], title: 'Minecraft Java or Bedrock Edition', url: 'https://www.minecraft.net/en-us/article/java-or-bedrock-edition' },
  { ids: ['011', '012'], title: 'No Man’s Sky Next Generation update', url: 'https://www.nomanssky.com/next-generation-update/' },
  { ids: ['013', '014'], title: 'Fall Guys launches for free on June 21 across all platforms', url: 'https://www.fallguys.com/news/fall-guys-is-going-free-on-june-21-launching-on-playstation-nintendo-switch-xbox-and-the-epic-games-store' },
  { ids: ['025', '026'], title: 'Unicode UTF encoding FAQ', url: 'https://www.unicode.org/faq/utf_bom.html' },
  { ids: ['027', '028'], title: 'TypeScript: JavaScript with syntax for types', url: 'https://www.typescriptlang.org/' },
  { ids: ['035', '036'], title: 'NASA Mercury facts', url: 'https://science.nasa.gov/mercury/facts/' },
  { ids: ['037', '038'], title: 'NASA Venus facts', url: 'https://science.nasa.gov/venus/venus-facts/' },
  { ids: ['043', '044'], title: 'Godot download archive', url: 'https://godotengine.org/download/archive/' },
  { ids: ['071'], title: 'Godot frequently asked questions: supported platforms', url: 'https://docs.godotengine.org/en/4.4/about/faq.html' },
  { ids: ['072'], title: 'USGS: how hot are Yellowstone’s boiling waters?', url: 'https://www.usgs.gov/observatories/yvo/news/how-hot-are-yellowstones-boiling-waters-some-are-hotter-others' }
];
const catalog = searchReplaySchema.parse({ origin: 'host_web_search_curated', recorded_at: new Date().toISOString(),
  description: 'Assistant free web-search URLs selected after the engine freeze from heldout input messages only. Expected verdicts and reference URLs were not consulted. Search discovery is simulated; source fetching and model inference remain live. No answer text or rendered fallback is supplied.',
  items: inputs.map(({ id, message }) => { const source = groups.find((group) => group.ids.includes(id.replace('claim-', '')));
    return { id, claim: message, query: message, sources: source ? [{ title: source.title, url: source.url }] : [], documents: [] }; }) });
await writeFile('fixtures/search/heldout.json', `${JSON.stringify(catalog, null, 2)}\n`, { flag: 'wx' });
console.info(`Prepared ${catalog.items.length} heldout search entries after code freeze. No reference labels were read by the curator.`);

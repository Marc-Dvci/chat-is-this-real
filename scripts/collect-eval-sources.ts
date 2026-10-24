import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fetchSource } from '../src/check/fetch-source.js';
import { evaluationSourceCatalogSchema } from '../src/shared/schemas.js';

async function collect(): Promise<void> {
  const catalog = evaluationSourceCatalogSchema.parse(JSON.parse(await readFile('scripts/eval-source-catalog.json', 'utf8')));
  await mkdir('data/eval-sources', { recursive: true, mode: 0o700 });
  const selected = process.argv.slice(2);
  if (selected.some((id) => !(id in catalog))) throw new Error('Unknown source identifier.');
  const entries = Object.entries(catalog).filter(([id]) => !selected.length || selected.includes(id));
  for (let start = 0; start < entries.length; start += 4) {
    await Promise.all(entries.slice(start, start + 4).map(async ([id, url]) => {
      const source = await fetchSource(url, id);
      await writeFile(`data/eval-sources/${id}.json`, JSON.stringify(source, null, 2), { mode: 0o600 });
      console.info(`${id}: HTTP ${source.status}, ${source.text.length} text characters.`);
    }));
  }
}

void collect().catch(() => { console.error('Source collection failed.'); process.exitCode = 1; });

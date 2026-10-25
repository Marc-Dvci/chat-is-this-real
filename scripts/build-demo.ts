import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { demoCatalogSchema, sourceDocumentSchema, twitchVideosRecordingSchema } from '../src/shared/schemas.js';
import { sha256Text } from '../src/shared/sha256.js';
import { openDatabase } from '../src/store/database.js';
import { seedDemo } from '../src/demo/seed.js';
import { CheckStore } from '../src/store/check-store.js';
import { PublicResults } from '../src/server/public-result.js';
import { assertNoSecretFragments } from '../src/shared/format-chat.js';
import { loadedSecrets } from '../src/shared/secrets.js';

const baseText = await readFile('fixtures/demo/catalog.json', 'utf8'), showcaseText = await readFile('fixtures/demo/showcase.json', 'utf8');
const base = demoCatalogSchema.parse(JSON.parse(baseText)), showcase = demoCatalogSchema.parse(JSON.parse(showcaseText));
const catalog = demoCatalogSchema.parse({ ...base, origin: `${base.origin} Newly recorded multilingual showcase. Recorded outcomes; no new inference.`, cases: [...base.cases, ...showcase.cases] });
const db = openDatabase(':memory:');
try {
  seedDemo(db, catalog); const checks = new CheckStore(db), results = new PublicResults(db);
  const preview = checks.get('demo-check-showcase-en'); if (!preview) throw new Error('Missing launch preview.');
  await mkdir('web/public', { recursive: true }); await writeFile('web/public/launch-preview.json', JSON.stringify(results.project(preview)));
  for (const item of catalog.cases) {
    const job = checks.get(`demo-check-${item.key}`); if (!job) throw new Error('Missing demo check.');
    results.project(job);
    if (item.outcome.type !== 'vod') {
      const outcome = item.outcome;
      outcome.sources = outcome.sources.map((source) => {
        // Ship verified excerpts, never the complete fetched page, in the public demo.
        const text = outcome.evidence.filter((evidence) => evidence.source_id === source.id).map((evidence) => evidence.excerpt).join('\n');
        return sourceDocumentSchema.parse({ ...source, text, sha256: sha256Text(text), origin: 'recorded_render' });
      });
    }
  }
  const text = JSON.stringify(demoCatalogSchema.parse(catalog)); assertNoSecretFragments(text, loadedSecrets());
  await mkdir('web/public', { recursive: true }); await writeFile('web/public/demo-data.json', text);
  const videos = twitchVideosRecordingSchema.parse(JSON.parse(await readFile('fixtures/twitch/library-videos.json', 'utf8'))).response;
  await writeFile('web/public/demo-videos.json', JSON.stringify(videos));
  await writeFile('web/public/demo-proof.json', JSON.stringify({ original_catalog_sha256: sha256Text(baseText), showcase_sha256: sha256Text(showcaseText), output_sha256: sha256Text(text), source_text: 'Only stored, verbatim-verified excerpts. Original page hashes checked before export.' }, null, 2));
  console.info(`Static demo: ${catalog.cases.length} verified recorded cases; no model calls or full source pages in the public bundle.`);
} finally { db.close(); }

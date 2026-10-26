import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { loadDemoCatalog } from '../src/demo/replay.js';
import { seedDemo } from '../src/demo/seed.js';
import { PublicPublisher } from '../src/server/public-publisher.js';
import { PublicResults } from '../src/server/public-result.js';
import { loadLocalEnv } from '../src/shared/env.js';
import { openDatabase } from '../src/store/database.js';
import { CheckStore } from '../src/store/check-store.js';

// Publishes recorded checks to the deployed Worker through the production publisher,
// reads each page back, then removes one and confirms the page is gone.
loadLocalEnv();
const db = openDatabase(':memory:'), checks = new CheckStore(db), results = new PublicResults(db);
seedDemo(db, loadDemoCatalog());
const publisher = new PublicPublisher(db, checks, results);
if (!publisher.configured()) throw new Error('Set RESULTS_BASE_URL and RESULTS_SIGNING_KEY first.');
const picks = ['demo-check-showcase-en', 'demo-check-showcase-fr', 'demo-check-vod-promise'];
const rows: { job: string; url: string; status: number; ms: number }[] = [];
try {
  for (const job of picks) {
    const started = Date.now(), url = await publisher.publish(job);
    const page = await fetch(url); await page.body?.cancel();
    rows.push({ job, url, status: page.status, ms: Date.now() - started });
    console.info(`${job}: ${page.status} ${url}`);
  }
  const removed = rows[0];
  if (!removed) throw new Error('Nothing was published.');
  publisher.revoke([removed.job]);
  let status = 200;
  for (let attempt = 0; attempt < 30 && status === 200; attempt++) {
    await delay(3000); publisher.sweep();
    const page = await fetch(removed.url, { cache: 'no-store' }); await page.body?.cancel(); status = page.status;
  }
  console.info(`Removed ${removed.job}: ${status}`);
  await mkdir('eval/results', { recursive: true });
  await writeFile(`eval/results/receipts-live-${Date.now()}.json`, JSON.stringify({ suite: 'receipts-live', created_at: new Date().toISOString(),
    base: new URL(removed.url).origin, published: rows, removal: { job: removed.job, status_after: status } }, null, 2));
} finally { await publisher.close(); db.close(); }

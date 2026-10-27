import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { CheckEngine } from '../src/check/engine.js';
import { ModelClient } from '../src/llm/client.js';
import { loadModelConfig } from '../src/llm/config.js';
import { demoCatalogSchema, sourceSummarySchema, type CheckOutcome, type VodOutcome } from '../src/shared/schemas.js';
import { loadDemoCatalog } from '../src/demo/replay.js';
import { seedDemo } from '../src/demo/seed.js';
import { openDatabase } from '../src/store/database.js';
import { SegmentStore } from '../src/store/segment-store.js';
import { VodEngine } from '../src/vod/engine.js';
import { assertNoSecretFragments } from '../src/shared/format-chat.js';
import { loadedSecrets } from '../src/shared/secrets.js';

if (process.env.LIVE !== '1' || !process.argv.includes('--live')) throw new Error('Use LIVE=1 and --live to record showcase inference.');
process.env.SEARCH_MODE = 'replay'; process.env.SEARCH_REPLAY_PATH = 'fixtures/search/showcase.json';
process.env.MODELSTUDIO_ALLOW_PAID_SEARCH = 'false';
const config = loadModelConfig();
const run = new Date().toISOString().replace(/[:.]/gu, '-'), directory = `data/showcase/${run}`;
const model = new ModelClient(config, `${directory}/wire`), engine = new CheckEngine(model), db = openDatabase(':memory:');
const catalog = loadDemoCatalog(); seedDemo(db, catalog); const vod = new VodEngine(model, new SegmentStore(db));
const samples = [
  { key: 'showcase-wall', kind: 'real', language: 'en', text: 'you can see the great wall of china from space with your bare eyes, my teacher said so 🧱' },
  { key: 'showcase-en', kind: 'real', language: 'en', text: 'java + bedrock can play together on the same servers now, no mods needed Pog' },
  { key: 'showcase-octopus', kind: 'real', language: 'fr', text: 'attendez les pieuvres ont TROIS cœurs?? 😳' },
  { key: 'showcase-fr', kind: 'real', language: 'fr', text: "stardew sur PC c'est jusqu'à 8 joueurs maintenant 👀" },
  { key: 'showcase-es', kind: 'real', language: 'es', text: 'los arrays de JavaScript empiezan en 1, segurisimo 💀' },
  { key: 'showcase-vod', kind: 'vod', language: 'en', text: 'you said 50 pushups for 100 subs earlier... receipts?? KEKW' }
] as const;
const rows: { key: string; text: string; language: string; repetition: number; outcome: CheckOutcome | VodOutcome }[] = [];
const previous = catalog.cases.find((item) => item.key === 'vod-promise')?.outcome;
try {
  await mkdir(directory, { recursive: true });
  for (let repetition = 1; repetition <= 3; repetition++) for (const sample of samples) {
    const outcome = sample.kind === 'vod' ? await vod.run(randomUUID(), sample.text, previous?.type === 'vod' ? previous.broadcast_id ?? undefined : undefined)
      : await engine.run({ id: randomUUID(), claim: sample.text, context: [], channel: { title: 'Recorded showcase', category: 'Just Chatting', language: sample.language } }, { skipCache: true });
    if (outcome.type === 'vod' && previous?.type === 'vod' && outcome.found && previous.clip?.state === 'ready' && outcome.broadcast_id === previous.broadcast_id && outcome.offset_s === previous.offset_s && outcome.end_s === previous.end_s) outcome.clip = previous.clip;
    rows.push({ key: sample.key, text: sample.text, language: sample.language, repetition, outcome });
    console.info(`Showcase ${sample.key}, repetition ${repetition}: ${outcome.type === 'vod' ? outcome.found ? 'found' : 'not_found' : outcome.final_verdict}.`);
    await writeFile(`${directory}/outcomes.json`, JSON.stringify(rows, null, 2));
    if (outcome.reason === 'quota') throw new Error('Stop after a quota refusal.');
  }
  const fixture = demoCatalogSchema.parse({ ...catalog, origin: 'Multilingual chat examples. First of three live inference runs, with live fetching and verified excerpts. Not an evaluation split.',
    cases: samples.map((sample) => { const first = rows.find((row) => row.key === sample.key && row.repetition === 1); if (!first) throw new Error('Missing first showcase run.'); return { key: sample.key, kind: sample.kind, text: sample.text, outcome: first.outcome }; }) });
  const text = JSON.stringify(fixture, null, 2); assertNoSecretFragments(text, loadedSecrets());
  await writeFile('fixtures/demo/showcase.json', text);
} finally {
  const report = { suite: 'showcase', split: 'showcase-not-evaluation', created_at: new Date().toISOString(), git_commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), working_tree_dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
    discovery: 'Source URLs from web search. Source fetching and inference are live.', planned_repetitions: 3,
    rows: rows.map(({ outcome, ...row }) => ({ ...row, outcome: outcome.type === 'vod' ? outcome : { ...outcome, sources: outcome.sources.map((source) => sourceSummarySchema.parse(source)) } })) };
  const text = JSON.stringify(report, null, 2); assertNoSecretFragments(text, loadedSecrets());
  await mkdir('eval/results', { recursive: true }); await writeFile(`eval/results/showcase-${run}.json`, text); db.close();
}

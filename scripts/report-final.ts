import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { claimRunSummarySchema, engineFreezeSchema } from '../src/shared/schemas.js';

const files = (await readdir('eval/results')).sort();
const runs = await Promise.all((['dev', 'heldout'] as const).map(async (split) => {
  const name = files.filter((file) => file.startsWith(`claims-${split}-`) && file.endsWith('.json')).at(-1);
  if (!name) throw new Error(`Missing final ${split} report.`);
  return { file: name, ...claimRunSummarySchema.parse(JSON.parse(await readFile(`eval/results/${name}`, 'utf8'))) };
}));
const dev = runs[0], heldout = runs[1]; if (!dev || !heldout) throw new Error('Both final splits are required.');
if (runs.some((run) => run.attempted_items !== run.sample_count || run.metrics.not_attempted)) throw new Error('A final evaluation is incomplete.');
const frozen = engineFreezeSchema.parse(JSON.parse(await readFile('eval/FREEZE.json', 'utf8')));
const secs = (value: number | null) => value === null ? 'unavailable' : `${(value / 1000).toFixed(2)} s`;
const agreement = (run: typeof dev) => `${run.metrics.verdict_agreement.matched}/${run.sample_count}`;
const excerpts = (run: typeof dev) => `${run.metrics.excerpts.verified}/${run.metrics.excerpts.returned}`;
await mkdir('docs/figures', { recursive: true });
const escape = (text: string) => text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;');
function badge(name: string, label: string, value: string) {
  const first = label.length * 7 + 20, second = value.length * 7 + 20;
  return writeFile(`docs/figures/${name}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="${first + second}" height="28" role="img" aria-label="${escape(`${label}: ${value}`)}"><rect width="${first + second}" height="28" rx="5" fill="#0d6574"/><path d="M5 0H${first}V28H5Q0 28 0 23V5Q0 0 5 0" fill="#25323c"/><g fill="white" font-family="Arial,sans-serif" font-size="12" text-anchor="middle"><text x="${first / 2}" y="18">${escape(label)}</text><text x="${first + second / 2}" y="18">${escape(value)}</text></g></svg>`);
}
await badge('dev', 'dev agreement', agreement(dev)); await badge('heldout', 'heldout agreement', agreement(heldout));
await badge('excerpts', 'heldout literal excerpts', excerpts(heldout));
const tiles = runs.map((run, index) => { const x = 100 + index * 1160, m = run.metrics;
  return `<g><rect x="${x}" y="100" width="1040" height="1110" rx="24" fill="#f5f8fa"/><text x="${x + 60}" y="190" font-size="30" fill="#526674">${run.split.toUpperCase()} · ${run.sample_count} AUTHORED INPUTS</text><text x="${x + 60}" y="440" font-size="190" font-weight="700" fill="#172731">${agreement(run)}</text><text x="${x + 60}" y="510" font-size="38">verdict agreement</text><path d="M${x + 60} 575h920" stroke="#d7e1e8"/><text x="${x + 60}" y="710" font-size="84" font-weight="700" fill="#087f96">${excerpts(run)}</text><text x="${x + 60}" y="770" font-size="32">literal excerpts verified / returned</text><text x="${x + 60}" y="960" font-size="84" font-weight="700">${m.wrong_direction_errors}</text><text x="${x + 60}" y="1020" font-size="32">reversed directional verdicts</text><text x="${x + 60}" y="1140" font-size="26" fill="#526674">p50 ${secs(m.latency_ms.p50)} · p90 ${secs(m.latency_ms.p90)}</text></g>`;
}).join('');
await writeFile('docs/figures/evaluation.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1600" role="img" aria-label="Frozen engine dev and heldout measurements"><rect width="2400" height="1600" fill="white"/><g font-family="Arial,sans-serif" fill="#172731">${tiles}<text x="100" y="1340" font-size="32">Curated search discovery. Live source fetching and Qwen inference.</text><text x="100" y="1405" font-size="28" fill="#526674">Small authored corpus. Related source pages. Literal verification does not establish semantic correctness.</text><text x="100" y="1470" font-size="25" fill="#526674">Frozen engine ${frozen.git_commit.slice(0, 7)} · one heldout run · complete per-input reports in eval/results/</text></g></svg>`);
const maximum = Math.max(...runs.flatMap((run) => [run.metrics.latency_ms.p50 ?? 0, run.metrics.latency_ms.p90 ?? 0])) * 1.15;
const bars = runs.flatMap((run, split) => (['p50', 'p90'] as const).map((key, index) => {
  const value = run.metrics.latency_ms[key] ?? 0, y = 270 + split * 380 + index * 125, width = value / maximum * 1400;
  return `<text x="100" y="${y + 45}" font-size="32">${run.split.toUpperCase()} ${key}</text><rect x="400" y="${y}" width="${width}" height="70" rx="8" fill="${index ? '#9146ff' : '#087f96'}"/><text x="${430 + width}" y="${y + 45}" font-size="32">${secs(value)}</text>`;
})).join('');
await writeFile('docs/figures/latency.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1200" role="img" aria-label="End to end latency percentiles for the final dev and heldout runs"><rect width="2400" height="1200" fill="white"/><g font-family="Arial,sans-serif" fill="#172731"><text x="100" y="130" font-size="44">End-to-end latency · nearest-rank percentiles</text>${bars}<text x="100" y="1050" font-size="29">${dev.sample_count} dev inputs · ${heldout.sample_count} heldout inputs · all attempted inputs, including non-claims and guards.</text><text x="100" y="1110" font-size="29" fill="#526674">Curated search replay. Live fetching and inference. Paid search discovery excluded.</text></g></svg>`);
await writeFile('docs/evidence-summary.json', `${JSON.stringify({ engine: frozen.git_commit, dev, heldout }, null, 2)}\n`);
console.info(`Generated final evidence: ${agreement(dev)} dev; ${agreement(heldout)} heldout.`);

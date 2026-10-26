import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { dirname, resolve } from 'node:path';
import { deskSnapshotSchema } from '../src/shared/schemas.js';

const execute = promisify(execFile), run = new Date().toISOString().replace(/[:.]/gu, '-');
const directory = `.cache/quickstart-${run}`, root = process.cwd(), started = performance.now();
if ((await execute('git', ['status', '--porcelain'])).stdout.trim()) throw new Error('Commit the reviewable package before its clean-clone check.');
const commit = (await execute('git', ['rev-parse', 'HEAD'])).stdout.trim();
const npm = process.env.npm_execpath?.endsWith('npm-cli.js') ? process.env.npm_execpath : resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'); await stat(npm);
const steps: { name: string; elapsed_ms: number }[] = [];
const env = { ...process.env };
env.DEMO_DATABASE_PATH = ':memory:'; env.DASHBOARD_HOST = '127.0.0.1';
for (const key of Object.keys(env)) if (/^(?:TWITCH_|DASHSCOPE_|MODELSTUDIO_|MODEL_|RESULTS_|AUDIO_|ASR_|LIVE$|ALLOW_HELDOUT_RUN$)/u.test(key)) delete env[key];
async function step(name: string, file: string, args: string[], cwd: string) {
  console.info(`Clean clone: ${name}.`); const at = performance.now();
  const output = await execute(file, args, { cwd, env, windowsHide: true, maxBuffer: 4_000_000 });
  steps.push({ name, elapsed_ms: performance.now() - at });
  await writeFile(`${root}/data/submission/quickstart-${name}.log`, output.stdout + output.stderr);
}
await mkdir('data/submission', { recursive: true });
await step('clone', 'git', ['clone', '--quiet', '--no-hardlinks', '--', root, directory], root);
const clone = resolve(directory);
try { await stat(`${clone}/.env`); throw new Error('A local credential file entered the clone.'); }
catch (error) { if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error; }
await step('install', process.execPath, [npm, 'ci', '--no-audit', '--fund=false'], clone);
await step('build', process.execPath, [npm, 'run', 'build'], clone);
const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
const address = reservation.address(); if (!address || typeof address === 'string') throw new Error('No quickstart port.');
await new Promise<void>((done, reject) => reservation.close((error) => error ? reject(error) : done()));
const launch = performance.now(), child = spawn(process.execPath, ['dist/server/index.js', '--demo'], {
  cwd: clone, env: { ...env, PORT: String(address.port) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
});
let log = ''; child.stdout.on('data', (chunk: Buffer) => { log += chunk.toString('utf8'); }); child.stderr.on('data', (chunk: Buffer) => { log += chunk.toString('utf8'); });
try {
  const base = `http://127.0.0.1:${address.port}`; let ready = false;
  while (performance.now() - launch < 30_000) {
    if (child.exitCode !== null) throw new Error('The clean demo exited before readiness.');
    try { const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) }); if (response.ok) { ready = true; break; } } catch { /* Startup can precede the listener. */ }
    await new Promise<void>((done) => setTimeout(done, 200));
  }
  if (!ready || !(await fetch(base)).ok) throw new Error('The clean demo did not become ready.');
  const desk = deskSnapshotSchema.parse(await (await fetch(`${base}/api/desk`)).json());
  if (!desk.demo || !desk.checks.some((check) => check.input?.claim.includes('stardew sur PC'))) throw new Error('The recorded multilingual demo did not load.');
  steps.push({ name: 'ready', elapsed_ms: performance.now() - launch });
  const report = { suite: 'clean-clone', passed: true, created_at: new Date().toISOString(), git_commit: commit,
    node: process.version, platform: process.platform, steps, total_ms: performance.now() - started,
    mode: 'Fresh local Git clone, fresh workspace npm cache, npm ci and npm run build, then the compiled keyless demo. No .env or model/Twitch credentials.',
    recorded_checks_loaded: desk.checks.length };
  await writeFile(`eval/results/quickstart-${run}.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.info(`Clean-clone quickstart passed in ${(report.total_ms / 1000).toFixed(2)} seconds.`);
} finally {
  await writeFile(`${root}/data/submission/quickstart-server.log`, log);
  if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
}

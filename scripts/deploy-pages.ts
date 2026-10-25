import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { loadLocalEnv } from '../src/shared/env.js';
import { assertNoSecretFragments } from '../src/shared/format-chat.js';
import { loadedSecrets } from '../src/shared/secrets.js';

const execute = promisify(execFile), projectName = 'chat-is-this-real';
loadLocalEnv();
const object = (value: unknown): Record<string, unknown> => { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected deployment metadata.'); return value as Record<string, unknown>; };
const manifest = object(JSON.parse(await readFile('.cache/pages-build.json', 'utf8')));
if (manifest.static_only !== true || manifest.functions !== 0 || manifest.bindings !== 0 || typeof manifest.directory !== 'string' || !Array.isArray(manifest.files)) throw new Error('Build a static-only Pages package first.');
const directory = resolve(manifest.directory); if (!directory.startsWith(`${resolve('public-dist')}/`) && !directory.startsWith(`${resolve('public-dist')}\\`)) throw new Error('The upload must stay in public-dist.');
async function files(path: string): Promise<string[]> { return (await Promise.all((await readdir(path, { withFileTypes: true })).map((entry) => entry.isDirectory() ? files(`${path}/${entry.name}`) : [`${path}/${entry.name}`]))).flat().sort(); }
const paths = await files(directory), expected = new Map<string, string>();
for (const item of manifest.files as unknown[]) { const entry = object(item); if (typeof entry.path !== 'string' || typeof entry.sha256 !== 'string') throw new Error('Invalid asset fingerprint.'); expected.set(entry.path, entry.sha256); }
if (paths.length !== expected.size || paths.length > 20000) throw new Error('The upload file list changed.');
for (const path of paths) {
  const relative = path.slice(directory.length + 1).replaceAll('\\', '/');
  if (/(?:^|\/)(?:functions|_worker\.js|_routes\.json|\.[^/]+)(?:\/|$)/u.test(relative)) throw new Error('The upload contains a forbidden executable or private path.');
  const bytes = await readFile(path); if (bytes.length > 25 * 1024 * 1024 || expected.get(relative) !== createHash('sha256').update(bytes).digest('hex')) throw new Error('An asset changed or exceeds the free upload limit.');
  assertNoSecretFragments(bytes.toString('utf8'), loadedSecrets());
}
const environment = { ...process.env, WRANGLER_SEND_METRICS: 'false', CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false' };
const cli = async (args: string[]) => execute(process.execPath, [resolve('node_modules/wrangler/bin/wrangler.js'), ...args], { windowsHide: true, env: environment, maxBuffer: 2_000_000 });
const identity = object(JSON.parse((await cli(['whoami', '--json'])).stdout));
if (identity.loggedIn !== true || !Array.isArray(identity.accounts) || identity.accounts.length !== 1) throw new Error('Sign in to the intended single Cloudflare account first.');
const account = object(identity.accounts[0]); if (typeof account.id !== 'string' || !/^[a-f0-9]{32}$/u.test(account.id)) throw new Error('Invalid deployment account.');
const authentication = object(JSON.parse((await cli(['auth', 'token', '--json'])).stdout)); if (typeof authentication.token !== 'string') throw new Error('A token-based Cloudflare authorization is required.');
await mkdir('data/deploy', { recursive: true });
async function request(path: string, method = 'GET', value?: unknown) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account.id}/pages${path}`, {
    method, headers: { Authorization: `Bearer ${authentication.token}`, ...(value ? { 'Content-Type': 'application/json' } : {}) },
    ...(value ? { body: JSON.stringify(value) } : {}), signal: AbortSignal.timeout(30_000)
  });
  const body = object(await response.json()); if (response.status === 404 && method === 'GET') return null;
  if (!response.ok || body.success !== true) { await writeFile('data/deploy/provider-error.json', JSON.stringify(body)); throw new Error(`Pages API refused the operation (HTTP ${response.status}).`); }
  return object(body.result);
}
if ((await execute('git', ['status', '--porcelain'])).stdout.trim()) throw new Error('Commit the tested deployment package before publishing.');
const commit = (await execute('git', ['rev-parse', 'HEAD'])).stdout.trim();
let project = await request(`/projects/${projectName}`);
if (!project) project = await request('/projects', 'POST', { name: projectName, production_branch: 'main' });
if (!project || project.production_branch !== 'main' || project.source) throw new Error('The Pages project must use direct static upload to main.');
function checkBindings(value: Record<string, unknown>) {
  const configurations = object(value.deployment_configs), production = object(configurations.production);
  for (const field of ['env_vars', 'kv_namespaces', 'durable_object_namespaces', 'd1_databases', 'r2_buckets', 'services', 'analytics_engine_datasets', 'ai_bindings', 'vectorize_bindings', 'hyperdrive_bindings', 'queues']) {
    const binding = production[field]; if (binding && typeof binding === 'object' && Object.keys(binding).length) throw new Error(`The static project has unexpected ${field}.`);
  }
}
checkBindings(project);
const uploadEnvironment = { ...environment, CLOUDFLARE_ACCOUNT_ID: account.id };
for (const key of Object.keys(uploadEnvironment)) if (/^(?:TWITCH_|DASHSCOPE_|MODELSTUDIO_|MODEL_|RESULTS_|AUDIO_|ASR_|LIVE$|ALLOW_HELDOUT_RUN$)/u.test(key)) delete (uploadEnvironment as Record<string, string | undefined>)[key];
console.info(`Uploading ${paths.length} verified static files. Functions: 0. Bindings: 0.`);
const uploaded = await execute(process.execPath, [resolve('node_modules/wrangler/bin/wrangler.js'), 'pages', 'deploy', directory, '--project-name', projectName, '--branch', 'main', '--commit-hash', commit, '--commit-dirty=false'], {
  cwd: directory, env: uploadEnvironment, windowsHide: true, maxBuffer: 2_000_000
});
await writeFile('data/deploy/upload.txt', uploaded.stdout + uploaded.stderr);
project = await request(`/projects/${projectName}`); if (!project || typeof project.subdomain !== 'string' || !/^[a-z0-9-]+\.pages\.dev$/u.test(project.subdomain)) throw new Error('Missing deployed Pages address.');
checkBindings(project);
const deployment = object(project.canonical_deployment), stage = object(deployment.latest_stage);
if (stage.status !== 'success') throw new Error('The production deployment did not finish successfully.');
const report = { deployed_at: new Date().toISOString(), url: `https://${project.subdomain}/`, project: projectName, git_commit: commit, deployment_id: deployment.id,
  static_only: true, functions: 0, bindings: 0, files: paths.length, cost_basis: 'Cloudflare Pages static asset requests are free and unlimited on both account plans. Direct local upload; no cloud builds, Functions or storage bindings.',
  pricing_source: 'https://developers.cloudflare.com/pages/functions/pricing/' };
await writeFile('data/deploy/pages-deployment.json', JSON.stringify(report, null, 2)); console.info(`Static site deployed: ${report.url}`);

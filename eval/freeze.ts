import { readFile, readdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { engineFreezeSchema, engineConfigSchema } from '../src/shared/schemas.js';
import { loadModelConfig } from '../src/llm/config.js';
import { sha256, verifyEvaluationLock } from './lock.js';

const execute = promisify(execFile);
const path = 'eval/FREEZE.json';
function configuration() {
  const { DASHSCOPE_API_KEY: _secret, ...model } = loadModelConfig();
  void _secret;
  const { SEARCH_REPLAY_PATH: _catalog, ...engine } = engineConfigSchema.parse(process.env);
  void _catalog;
  if (model.MODELSTUDIO_ALLOW_PAID_SEARCH || engine.SEARCH_MODE !== 'replay') throw new Error('The final evaluation requires free search replay.');
  return { ...model, ...engine };
}
async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? files(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]))).flat().sort();
}
async function fingerprint() {
  const paths = [...await files('src'), ...await files('config'), ...await files('companion'),
    'eval/claims.ts', 'eval/metrics.ts', 'eval/run.ts', 'eval/lock.ts', 'eval/freeze.ts', 'package.json', 'package-lock.json'];
  return Promise.all(paths.sort().map(async (file) => ({ path: file, sha256: sha256(await readFile(file)) })));
}
export async function verifyFrozenEngine(): Promise<void> {
  const frozen = engineFreezeSchema.parse(JSON.parse(await readFile(path, 'utf8')));
  if (JSON.stringify(frozen.files) !== JSON.stringify(await fingerprint()) || JSON.stringify(frozen.configuration) !== JSON.stringify(configuration())) {
    throw new Error('The final evaluation engine differs from its freeze.');
  }
}
export async function freezeEngine(): Promise<void> {
  await verifyEvaluationLock();
  const dirty = (await execute('git', ['status', '--porcelain', '--', 'src', 'config', 'companion', 'eval', 'package.json', 'package-lock.json'])).stdout.trim();
  if (dirty) throw new Error('Commit the evaluation engine before freezing it.');
  const manifest = engineFreezeSchema.parse({ version: 1, created_at: new Date().toISOString(), git_commit: (await execute('git', ['rev-parse', 'HEAD'])).stdout.trim(),
    files: await fingerprint(), configuration: configuration() });
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  console.info('Saved the final engine fingerprint. Heldout data may now be prepared without tuning the engine.');
}

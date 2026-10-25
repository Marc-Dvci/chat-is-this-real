import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { stripVTControlCharacters } from 'node:util';
import { assertNoSecretFragments } from '../src/shared/format-chat.js';
import { loadedSecrets } from '../src/shared/secrets.js';

await mkdir('data/film', { recursive: true, mode: 0o700 });
const events: { at_s: number; text: string }[] = [], started = performance.now();
async function record(args: string[]): Promise<void> {
  events.push({ at_s: (performance.now() - started) / 1000, text: `$ node ${args.join(' ')}\n` });
  const child = spawn(process.execPath, args, { windowsHide: true, env: { ...process.env, NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const add = (bytes: Buffer) => events.push({ at_s: (performance.now() - started) / 1000, text: stripVTControlCharacters(bytes.toString('utf8')) });
  child.stdout.on('data', add); child.stderr.on('data', add);
  await new Promise<void>((resolve, reject) => { child.once('error', reject); child.once('exit', (code) => code === 0 ? resolve() : reject(new Error('The filmed build check failed.'))); });
}
await record(['node_modules/typescript/bin/tsc', '--noEmit']);
await record(['node_modules/vitest/vitest.mjs', 'run', 'tests/evidence.test.ts']);
const output = events.map((event) => event.text).join(''), diff = execFileSync('git', ['diff', 'ace2b3c', 'de72af3', '--', 'src/check/verify.ts'], { encoding: 'utf8', windowsHide: true });
const text = JSON.stringify({ source: 'Actual commands executed for the film; no synthetic terminal output.', recorded_at: new Date().toISOString(), events, output, diff }, null, 2);
assertNoSecretFragments(text, loadedSecrets()); await writeFile('data/film/build-output.json', text); console.info('Recorded actual typecheck, source regression output and retrieval diff.');

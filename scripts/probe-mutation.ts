import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';

const execute = promisify(execFile), file = 'src/check/verify.ts', original = await readFile(file);
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const previous = (await execute('git', ['show', 'ace2b3c:src/check/verify.ts'], { encoding: 'utf8', windowsHide: true })).stdout;
const test = async () => {
  try { const result = await execute(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'tests/evidence.test.ts'], { encoding: 'utf8', windowsHide: true }); return { exit_code: 0, output: result.stdout + result.stderr }; }
  catch (error) { if (!error || typeof error !== 'object' || !('code' in error) || !('stdout' in error) || !('stderr' in error)) throw error; return { exit_code: typeof error.code === 'number' ? error.code : -1, output: String(error.stdout) + String(error.stderr) }; }
};
let failed: Awaited<ReturnType<typeof test>> | undefined;
try { await writeFile(file, previous); failed = await test(); }
finally { await writeFile(file, original); }
const restored = hash(await readFile(file)) === hash(original), passed = await test();
const detected = failed?.exit_code === 1 && /preserves a one-digit count/u.test(failed.output) && /AssertionError/u.test(failed.output);
const report = { suite: 'hardening-mutation', created_at: new Date().toISOString(), git_commit: (await execute('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })).stdout.trim(),
  fixture: 'fixtures/demo/showcase.json', mutation: 'Restore the pre-fix source passage selector from ace2b3c.', mutation_detected: detected,
  mutant_exit_code: failed?.exit_code ?? null, restored_byte_for_byte: restored, restored_exit_code: passed.exit_code, source_sha256: hash(original) };
await mkdir('eval/results', { recursive: true }); await writeFile(`eval/results/hardening-mutation-${new Date().toISOString().replace(/[:.]/gu, '-')}.json`, JSON.stringify(report, null, 2));
console.info(JSON.stringify(report)); if (!detected || !restored || passed.exit_code !== 0) process.exitCode = 1;

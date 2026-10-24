import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { evaluationLockSchema } from '../src/shared/schemas.js';

const execute = promisify(execFile);
export const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');

export async function verifyEvaluationLock(root = process.cwd()) {
  const manifest = evaluationLockSchema.parse(JSON.parse(await readFile(join(root, 'eval/lock.json'), 'utf8')));
  const markdown = await readFile(join(root, 'eval/LOCK.md'), 'utf8');
  if (new Set(manifest.files.map((file) => file.path)).size !== 4 || !markdown.includes(`Data commit: \`${manifest.data_commit}\``)) {
    throw new Error('Evaluation lock metadata does not match.');
  }
  for (const file of manifest.files) {
    if (!markdown.includes(`| ${file.path} | \`${file.sha256}\` |`)) throw new Error('Evaluation lock document does not match.');
    if (sha256(await readFile(join(root, file.path))) !== file.sha256) throw new Error(`Locked evaluation file changed: ${file.path}`);
    const committed = await execute('git', ['show', `${manifest.data_commit}:${file.path}`], { cwd: root, encoding: 'buffer', maxBuffer: 2 * 1024 * 1024 });
    if (sha256(committed.stdout) !== file.sha256) throw new Error(`Evaluation data commit does not match: ${file.path}`);
  }
  return manifest;
}

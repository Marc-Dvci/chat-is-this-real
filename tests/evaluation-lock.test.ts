import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { verifyEvaluationLock } from '../eval/lock.js';
import { evaluationLockSchema } from '../src/shared/schemas.js';

it('verifies locked bytes against the actual data commit', async () => {
  const manifest = await verifyEvaluationLock();
  expect(manifest.files).toHaveLength(4);
});

it('refuses an altered evaluation before attempting to run an engine', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chat-real-lock-'));
  if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('chat-real-lock-')) throw new Error('Unexpected temporary test directory.');
  try {
    await mkdir(join(root, 'eval/vod'), { recursive: true });
    const manifest = evaluationLockSchema.parse(JSON.parse(await readFile('eval/lock.json', 'utf8')));
    for (const path of ['eval/lock.json', 'eval/LOCK.md', ...manifest.files.map((file) => file.path)]) {
      await writeFile(join(root, path), await readFile(path));
    }
    await writeFile(join(root, 'eval/claims.jsonl'), 'altered evaluation\n');
    await expect(verifyEvaluationLock(root)).rejects.toThrow('Locked evaluation file changed: eval/claims.jsonl');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

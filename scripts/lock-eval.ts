import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { evaluationLockSchema } from '../src/shared/schemas.js';
import { sha256, verifyEvaluationLock } from '../eval/lock.js';

const execute = promisify(execFile);
async function lock(): Promise<void> {
  try { await readFile('eval/LOCK.md'); throw new Error('Evaluation data is already locked.'); }
  catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
  const commit = (await execute('git', ['rev-parse', 'HEAD'])).stdout.trim();
  const files = [];
  for (const path of ['eval/claims.jsonl', 'eval/vod/transcript.jsonl', 'eval/vod/questions.jsonl', 'eval/vod/source.json']) {
    const bytes = await readFile(path);
    const committed = await execute('git', ['show', `${commit}:${path}`], { encoding: 'buffer', maxBuffer: 2 * 1024 * 1024 });
    if (sha256(bytes) !== sha256(committed.stdout)) throw new Error('Commit all evaluation data before locking.');
    files.push({ path, sha256: sha256(bytes) });
  }
  const manifest = evaluationLockSchema.parse({ version: 1, data_commit: commit, created_at: new Date().toISOString(), files });
  await writeFile('eval/lock.json', JSON.stringify(manifest, null, 2) + '\n');
  await writeFile('eval/LOCK.md', ['# Evaluation lock', '', `Data commit: \`${commit}\``, '',
    '| File | SHA-256 |', '|---|---|', ...manifest.files.map((file) => `| ${file.path} | \`${file.sha256}\` |`), '',
    'The heldout claims run once at M11. Prompt and threshold tuning use dev claims only.',
    'Corrections create new item IDs and retire old IDs in `eval/retired.json`; locked items stay unchanged.',
    'Manual label review is deferred until the end at the user\'s request. See `docs/EVAL_REVIEW.md`.', ''].join('\n'));
  await verifyEvaluationLock();
  console.info('Locked evaluation data against its committed content.');
}

void lock().catch(() => { console.error('Evaluation locking failed. Check committed data and existing lock files.'); process.exitCode = 1; });

import { parseArgs } from 'node:util';
import { evaluationOptionsSchema } from '../src/shared/schemas.js';
import { verifyEvaluationLock } from './lock.js';
import { runClaims } from './claims.js';

async function run(): Promise<void> {
  const { values } = parseArgs({ options: {
    suite: { type: 'string', default: 'claims' }, split: { type: 'string', default: 'dev' }, 'verify-lock': { type: 'boolean', default: false }
  } });
  const options = evaluationOptionsSchema.parse({ suite: values.suite, split: values.split, verify_lock: values['verify-lock'] });
  await verifyEvaluationLock();
  if (options.verify_lock) { console.info('Evaluation file hashes and committed data match the lock.'); return; }
  if (options.suite === 'claims') { await runClaims(options.split); return; }
  console.error('The VOD evaluation engine is scheduled for M6. No measurements were produced.');
  process.exitCode = 1;
}

void run().catch((error: unknown) => {
  const allowed = new Set(['Set LIVE=1 to run a live evaluation.', 'Heldout evaluation is reserved for M11.']);
  console.error(error instanceof Error && (error.message.startsWith('Locked evaluation file changed:') || allowed.has(error.message))
    ? error.message : 'Evaluation stopped. Check locked data, configuration and any saved report.');
  process.exitCode = 1;
});

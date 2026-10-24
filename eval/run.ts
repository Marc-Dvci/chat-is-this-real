import { parseArgs } from 'node:util';
import { evaluationOptionsSchema } from '../src/shared/schemas.js';
import { verifyEvaluationLock } from './lock.js';

async function run(): Promise<void> {
  const { values } = parseArgs({ options: {
    suite: { type: 'string', default: 'claims' }, split: { type: 'string', default: 'dev' }, 'verify-lock': { type: 'boolean', default: false }
  } });
  const options = evaluationOptionsSchema.parse({ suite: values.suite, split: values.split, verify_lock: values['verify-lock'] });
  await verifyEvaluationLock();
  if (options.verify_lock) { console.info('Evaluation file hashes and committed data match the lock.'); return; }
  console.error(`The ${options.suite} evaluation engine is scheduled for ${options.suite === 'claims' ? 'M5' : 'M6'}. No measurements were produced.`);
  process.exitCode = 1;
}

void run().catch((error: unknown) => {
  console.error(error instanceof Error && error.message.startsWith('Locked evaluation file changed:') ? error.message : 'Evaluation lock verification failed. Restore the locked data before running.');
  process.exitCode = 1;
});

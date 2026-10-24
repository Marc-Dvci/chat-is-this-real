import { buildApp } from './app.js';
import { serverConfigSchema } from '../shared/schemas.js';
import { loadLocalEnv } from '../shared/env.js';

const demo = process.argv.includes('--demo');
if (!demo) loadLocalEnv();
const config = serverConfigSchema.parse({ PORT: process.env.PORT });
const app = buildApp({ databasePath: demo ? ':memory:' : 'data/chat.db', demo });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().catch(() => {
      process.exitCode = 1;
    });
  });
}

try {
  // The dashboard controls publishing, so it stays on the local machine.
  const address = await app.listen({ host: '127.0.0.1', port: config.PORT });
  console.info(`Chat Is This Real${demo ? ' recorded demo' : ''}: ${address}/`);
} catch {
  console.error('Could not start the local server. Check PORT and whether it is already in use.');
  await app.close();
  process.exitCode = 1;
}

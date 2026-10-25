import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resultSigningKeySchema } from '../src/shared/schemas.js';
import { loadLocalEnv } from '../src/shared/env.js';
import { registerSecrets } from '../src/shared/secrets.js';

async function setup(): Promise<void> {
  loadLocalEnv();
  let text = ''; try { text = await readFile('.env', 'utf8'); } catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
  const current = resultSigningKeySchema.safeParse(process.env.RESULTS_SIGNING_KEY);
  const secret = current.success ? current.data : randomBytes(32).toString('hex'); registerSecrets([secret]);
  const pattern = /^[ \t]*(?:export[ \t]+)?RESULTS_SIGNING_KEY=[^\r\n]*/mu;
  text = pattern.test(text) ? text.replace(pattern, `RESULTS_SIGNING_KEY=${secret}`) : `${text}${text.endsWith('\n') || !text ? '' : '\n'}RESULTS_SIGNING_KEY=${secret}\n`;
  await writeFile('.env', text, { mode: 0o600 });
  await mkdir('worker', { recursive: true });
  await writeFile('worker/.dev.vars', `RESULTS_SIGNING_KEY=${JSON.stringify(secret)}\n`, { mode: 0o600 });
  console.info('Local signing key is ready in ignored files. No secret was printed or uploaded.');
  console.info('The Worker can be tested locally. Cloudflare sign-in and deployment approval are still required for the public URL.');
}
void setup().catch(() => { console.error('Public setup stopped. Check local file access. The signing key has not been printed.'); process.exitCode = 1; });

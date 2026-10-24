import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

test('startup reads PORT from .env and respects an exported override', async ({ request }) => {
  const directory = await mkdtemp(join(tmpdir(), 'chat-is-this-real-config-'));
  try {
    for (const exported of [false, true]) {
      const reservation = createServer();
      reservation.listen(0, '127.0.0.1');
      await once(reservation, 'listening');
      const address = reservation.address();
      if (!address || typeof address === 'string') throw new Error('No test port.');
      await new Promise<void>((done, reject) => reservation.close((error) => error ? reject(error) : done()));
      await writeFile(join(directory, '.env'), `PORT=${exported ? 1 : address.port}\n`);
      const env = { ...process.env };
      delete env.PORT;
      if (exported) env.PORT = String(address.port);
      const child = spawn(process.execPath, [resolve('dist/server/index.js')], {
        cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
      });
      try {
        await expect.poll(async () => {
          if (child.exitCode !== null) throw new Error('The test server exited before becoming ready.');
          return request.get(`http://127.0.0.1:${address.port}/api/health`, { timeout: 1000 })
            .then((response) => response.status()).catch(() => 0);
        }).toBe(200);
      } finally {
        if (child.exitCode === null) {
          const closed = once(child, 'exit');
          child.kill();
          await closed;
        }
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

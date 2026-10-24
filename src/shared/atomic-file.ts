import { randomUUID } from 'node:crypto';
import { rename, unlink, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

export async function writeAtomic(path: string, text: string): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, text, { mode: 0o600, flag: 'wx' });
  try {
    for (let attempt = 0; ; attempt++) {
      try { await rename(temporary, path); return; }
      catch (error) {
        const transient = error instanceof Error && 'code' in error && ['EPERM', 'EBUSY', 'EACCES'].includes(String(error.code));
        if (!transient || attempt >= 19) throw error;
        await delay(100);
      }
    }
  } finally { await unlink(temporary).catch(() => undefined); }
}

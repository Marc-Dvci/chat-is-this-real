import { loadEnvFile } from 'node:process';

export function loadLocalEnv(path = '.env'): void {
  try {
    loadEnvFile(path);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      throw new Error('Could not load local environment configuration.', { cause: error });
    }
  }
}

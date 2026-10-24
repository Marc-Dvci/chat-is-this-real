import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    pool: 'threads',
    maxWorkers: 4,
    clearMocks: true,
    restoreMocks: true,
    allowOnly: false,
    passWithNoTests: false
  }
});

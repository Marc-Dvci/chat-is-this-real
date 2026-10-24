import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', '.cache/**', 'data/**', 'coverage/**', 'e2e/screens/**', 'test-results/**', 'playwright-report/**', '.wrangler/**'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error'
    }
  }
);

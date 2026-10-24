import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'web', plugins: [react()],
  build: { outDir: '../web-dist', emptyOutDir: true,
    rolldownOptions: { input: { dashboard: resolve('web/index.html'), overlay: resolve('web/overlay.html') } } }
});

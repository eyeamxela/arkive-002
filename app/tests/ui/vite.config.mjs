import { FIXTURE_ENV } from '../fixtureSupport.mjs';
import { defineConfig } from 'vite'; // Loaded directly by run.mjs; production config is untouched.
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('./', import.meta.url)),
  plugins: [react()],
  // Synthetic identity and scope only. Never forward the host environment.
  define: { 'process.env': JSON.stringify(FIXTURE_ENV) },
  resolve: { alias: [{ find: /^convex\/react$/, replacement: fileURLToPath(new URL('./convex-react.ts', import.meta.url)) }] },
  server: { host: '127.0.0.1', port: 1421, strictPort: true, fs: { allow: [fileURLToPath(new URL('../../', import.meta.url))] } },
  build: { target: 'esnext', outDir: '/tmp/arkive-isolated-ui-build', emptyOutDir: false },
});

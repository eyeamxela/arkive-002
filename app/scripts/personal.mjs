import { build, createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chmod, copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const mode = process.argv[2] ?? 'dev';
if (mode === 'prepare') {
  const directory = resolve(root, '../.desktop-runtime');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await copyFile(process.execPath, resolve(directory, 'node'));
  await chmod(resolve(directory, 'node'), 0o755);
  console.log(`Prepared Node ${process.version} (${process.platform}/${process.arch}) for the local desktop bundle.`);
} else {
  const options = {
    root, configFile: false, plugins: [react(), {
      name: 'arkive-personal-entry',
      configureServer(server) {
        // The Personal preview root must not accidentally serve the legacy cloud shell.
        server.middlewares.use((request, _response, next) => {
          const url = new URL(request.url || '/', 'http://localhost');
          if (url.pathname === '/' || url.pathname === '/index.html') request.url = `/local.html${url.search}`;
          next();
        });
      },
    }], clearScreen: false,
    server: { host: '127.0.0.1', port: 1420, strictPort: true },
    build: { outDir: 'dist-personal', rollupOptions: { input: resolve(root, 'local.html') } },
  };
  if (mode === 'build') await build(options);
  else if (mode === 'dev') { const server = await createServer(options); await server.listen(); server.printUrls(); }
  else throw new Error('Use personal.mjs dev, build or prepare');
}

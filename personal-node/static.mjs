import path from 'node:path';
import { lstat, readFile } from 'node:fs/promises';

// Only the public, compiled Personal UI is served. Never use a Brain/source
// directory here. There is deliberately no generic file/path endpoint.
export async function servePersonalUi(req, res, route, directory) {
  if (!directory || req.method !== 'GET') return false;
  const relative = ['/', '/local.html'].includes(route) ? 'local.html'
    : /^\/assets\/[a-zA-Z0-9_.-]+\.(?:js|css)$/.test(route) ? route.slice(1) : null;
  if (!relative) return false;
  try {
    const filename = path.join(directory, relative);
    const stat = await lstat(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024) return false;
    const content = await readFile(filename);
    res.writeHead(200, {
      'Content-Type': relative.endsWith('.js') ? 'text/javascript; charset=utf-8'
        : relative.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    });
    res.end(content);
    return true;
  } catch { return false; }
}

// Serves the BUILT renderer (out/renderer) over HTTP for visual inspection.
//
// The Settings and notification windows are ordinary web pages, but they
// normally only exist inside an Electron BrowserWindow, which cannot be
// screenshotted or inspected with browser tooling. Opening the built files
// with a file:// URL does not work either — the pages are ES modules, and
// module scripts are blocked from file:// by the browser's origin rules.
//
// This serves them over http://localhost so layout, colours and tab
// behaviour can be checked in a normal browser. It is a DEVELOPMENT aid
// only: nothing here ships, and the pages will show a "Failed to load
// settings" error because window.settingsAPI is provided by the Electron
// preload, which does not exist outside Electron. Layout is still fully
// inspectable, which is the point.
//
// Usage:
//   npm run build && node tools/serve-renderer.mjs
//   then open http://localhost:5199/settings/

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const ROOT = join(import.meta.dirname, '..', 'out', 'renderer');
const PORT = Number(process.env.PORT) || 5199;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ttf': 'font/ttf',
  '.wav': 'audio/wav',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';

    // normalize() collapses any ../ before it is joined, so a crafted URL
    // cannot escape out/renderer. Local-only dev tool, but there is no
    // reason to write the unsafe version.
    const target = join(ROOT, normalize(pathname).replace(/^(\.\.[/\\])+/, ''));

    const body = await readFile(target);
    res.writeHead(200, { 'content-type': TYPES[extname(target)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }
});

server.listen(PORT, () => {
  console.log(`renderer preview: http://localhost:${PORT}/settings/`);
  console.log(`                  http://localhost:${PORT}/notification/`);
});

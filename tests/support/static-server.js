// Minimal static file server for the repo root, used only to serve index.html
// during tests. All third-party CDN and Supabase network calls are intercepted
// and mocked by Playwright routes (see vendor.js / supabase-mock.js) — this
// server never needs outbound internet access.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
};

const server = http.createServer((req, res) => {
  // Drop query strings (e.g. cache-busters like ?v=20260824) the way
  // GitHub Pages does, and decode %20 etc. so file lookups match disk.
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }
  const reqPath = urlPath === '/' ? '/index.html' : urlPath;
  const filePath = path.join(ROOT, path.normalize(reqPath).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Static server serving ${ROOT} on http://127.0.0.1:${PORT}`);
});

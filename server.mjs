import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchPrices } from './scripts/fetch-prices.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const port = process.env.PORT || 5173;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

// "Refresh prices" button: poe.ninja sends no CORS headers, so the browser asks this server to fetch and cache the prices.
// One refresh at a time and at most one per minute, to stay light on poe.ninja.
let refreshing = null, lastRefresh = 0;
async function refreshPrices(league) {
  if (refreshing) return refreshing;
  if (Date.now() - lastRefresh < 60_000) throw Object.assign(new Error('Prices were refreshed less than a minute ago'), { status: 429 });
  refreshing = fetchPrices(league).finally(() => { lastRefresh = Date.now(); refreshing = null; });
  return refreshing;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/refresh-prices' && req.method === 'POST') {
    try {
      const doc = await refreshPrices(url.searchParams.get('league') || undefined);
      res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(doc));
    } catch (e) {
      res.writeHead(e.status || 502, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: e.message }));
    }
  }
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}).listen(port, () => console.log(`http://localhost:${port}`));

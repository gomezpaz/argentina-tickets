#!/usr/bin/env node
// Static server for the ticket-watch dashboard + manual refresh endpoint.
// Binds 0.0.0.0 so you can open it from your phone on the same wifi.
// POST /refresh runs check.js + fetch-listings.js and returns their output.
// (On GitHub Pages there is no server; the dashboard detects that and the
// refresh button just reloads the committed data.)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const PORT = process.env.PORT || 4321;
const ROOT = __dirname;
const MIME = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css' };

const EVENTS = Object.keys(require('./events'));
const runOne = (script, ev) =>
  new Promise((resolve) =>
    execFile('node', [path.join(ROOT, script), `--event=${ev}`], { timeout: 90000 }, (e, so) =>
      resolve(e ? { error: String(e) } : safeJson(so))
    )
  );
let refreshing = null;
function runRefresh() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const out = {};
    for (const ev of EVENTS) {
      out[ev] = {
        listings: await runOne('fetch-listings.js', ev),
        check: await runOne('check.js', ev),
      };
    }
    refreshing = null;
    return out;
  })();
  return refreshing;
}
const safeJson = (s) => { try { return JSON.parse(s); } catch { return { raw: String(s).slice(0, 300) }; } };

http
  .createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/refresh') {
      runRefresh().then((out) => {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(out));
      });
      return;
    }
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    let file = path.normalize(path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath));
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(buf);
    });
  })
  .listen(PORT, '0.0.0.0', () => console.log(`ticket-watch on http://0.0.0.0:${PORT}`));

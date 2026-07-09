#!/usr/bin/env node
// 5-minute price watcher. Runs fetch-listings.js + check.js, commits the
// data (which updates the hosted dashboard), and appends to alerts.log when
// the cheapest price drops >= $25 or hits a new all-time low. alerts.log is
// gitignored — a Claude Code monitor watches it and sends the notification.
//
// Vivid Seats is bot-protected against scripts, so its price only updates
// when the Claude loop or cloud routine injects it (~every 30-60 min).

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const ALERTS = path.join(ROOT, 'alerts.log');
const INTERVAL_MS = 5 * 60 * 1000;

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: ROOT, timeout: 120000, encoding: 'utf8', ...opts });

async function tick() {
  const stamp = new Date().toISOString();
  try {
    try { run('git', ['pull', '--rebase', '-q']); } catch {}
    try { run('node', ['fetch-listings.js']); } catch (e) { console.error(stamp, 'listings:', e.message.slice(0, 120)); }
    const report = JSON.parse(run('node', ['check.js']));

    try {
      run('git', ['add', 'data']);
      run('git', ['commit', '-q', '-m', 'price check (watcher)']);
      try { run('git', ['push', '-q']); } catch { run('git', ['pull', '--rebase', '-q']); run('git', ['push', '-q']); }
    } catch {} // nothing to commit

    const { drop, newAllTimeLow, cheapest } = report;
    if ((drop != null && drop >= 25) || newAllTimeLow != null) {
      fs.appendFileSync(
        ALERTS,
        `${stamp} ALERT drop=$${drop} newATL=${newAllTimeLow ?? 'no'} cheapest=$${cheapest.price} (${cheapest.source}) ${cheapest.url}\n`
      );
    }
    console.log(stamp, 'ok', JSON.stringify(report.prices), 'drop:', drop);
  } catch (e) {
    console.error(stamp, 'tick failed:', e.message.slice(0, 200));
  }
}

(async () => {
  for (;;) {
    await tick();
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
})();

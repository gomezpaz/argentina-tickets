#!/usr/bin/env node
// 5-minute price watcher for every event in events.js. Runs fetch-listings.js
// + check.js per event, commits the data (which updates the hosted dashboard),
// and appends to alerts.log when a cheapest price drops >= $25 or hits a new
// all-time low. alerts.log is gitignored — a Claude Code monitor watches it
// and sends the notification.
//
// Vivid Seats is bot-protected against scripts, so its price only updates
// when the Claude loop or cloud routine injects it (~every 30-60 min).

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const EVENTS = require('./events');

const ROOT = __dirname;
const ALERTS = path.join(ROOT, 'alerts.log');
const INTERVAL_MS = 5 * 60 * 1000;

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: ROOT, timeout: 120000, encoding: 'utf8', ...opts });

function checkEvent(key, stamp) {
  try { run('node', ['fetch-listings.js', `--event=${key}`]); } catch (e) { console.error(stamp, key, 'listings:', e.message.slice(0, 120)); }
  const report = JSON.parse(run('node', ['check.js', `--event=${key}`]));

  const { drop, newAllTimeLow, cheapest } = report;
  // Oscillation guard: sources (esp. FIFA's crowdsourced feed) bounce between
  // values, re-triggering the drop rule for prices already alerted. Only alert
  // when meaningfully below the last alerted price, or on a true new low.
  const STATE = path.join(ROOT, `.alert-state-${key}.json`);
  let lastAlert = null;
  try { lastAlert = JSON.parse(fs.readFileSync(STATE, 'utf8')).price; } catch {}
  const isFresh = lastAlert == null || cheapest.price < lastAlert - 10;
  if (((drop != null && drop >= 25) || newAllTimeLow != null) && (isFresh || newAllTimeLow != null)) {
    fs.appendFileSync(
      ALERTS,
      `${stamp} ALERT [${EVENTS[key].short}] drop=$${drop} newATL=${newAllTimeLow ?? 'no'} cheapest=$${cheapest.price} (${cheapest.source}) ${cheapest.url}\n`
    );
    fs.writeFileSync(STATE, JSON.stringify({ price: cheapest.price, ts: stamp }));
  }
  console.log(stamp, key, 'ok', JSON.stringify(report.prices), 'drop:', drop);
}

// A pull --rebase killed by the exec timeout leaves the repo detached mid-rebase;
// every later commit then lands off-branch and push fails forever. Detect that,
// keep any stranded commits reachable on a rescue branch, and get back on main.
function ensureOnMain(stamp) {
  const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  if (branch === 'main') return;
  console.error(stamp, `HEAD is '${branch}', recovering to main`);
  try { run('git', ['rebase', '--abort']); } catch {}
  const head = run('git', ['rev-parse', 'HEAD']).trim();
  try { run('git', ['branch', '-f', `rescue-${stamp.slice(0, 10)}`, head]); } catch {}
  run('git', ['checkout', '-f', 'main']);
}

async function tick() {
  const stamp = new Date().toISOString();
  try {
    ensureOnMain(stamp);
    try { run('git', ['pull', '--rebase', '-q'], { timeout: 300000 }); } catch (e) { console.error(stamp, 'pull failed:', e.message.slice(0, 120)); }
    for (const key of Object.keys(EVENTS)) {
      if (EVENTS[key].archived) continue;
      try { checkEvent(key, stamp); } catch (e) { console.error(stamp, key, 'failed:', e.message.slice(0, 200)); }
    }
    let committed = false;
    try {
      run('git', ['add', 'data']);
      run('git', ['commit', '-q', '-m', 'price check (watcher)']);
      committed = true;
    } catch {} // nothing to commit
    if (committed) {
      try { run('git', ['push', '-q', 'origin', 'HEAD:main']); }
      catch {
        try {
          run('git', ['pull', '--rebase', '-q'], { timeout: 300000 });
          run('git', ['push', '-q', 'origin', 'HEAD:main']);
        } catch (e) { console.error(stamp, 'push failed:', e.message.slice(0, 200)); }
      }
    }
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

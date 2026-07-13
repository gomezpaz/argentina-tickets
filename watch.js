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

async function tick() {
  const stamp = new Date().toISOString();
  try {
    try { run('git', ['pull', '--rebase', '-q']); } catch {}
    for (const key of Object.keys(EVENTS)) {
      try { checkEvent(key, stamp); } catch (e) { console.error(stamp, key, 'failed:', e.message.slice(0, 200)); }
    }
    try {
      run('git', ['add', 'data']);
      run('git', ['commit', '-q', '-m', 'price check (watcher)']);
      try { run('git', ['push', '-q']); } catch { run('git', ['pull', '--rebase', '-q']); run('git', ['push', '-q']); }
    } catch {} // nothing to commit
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

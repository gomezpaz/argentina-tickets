#!/usr/bin/env node
// Multi-event World Cup ticket price checker (see events.js for the matches).
//
// Fetches lowest listed price from TickPick and Gametime (their event pages
// embed a "lowPrice" JSON field). Sources that block scripted fetches
// (Vivid Seats, SeatGeek) can be injected via --add name=price.
//
// Usage:
//   node check.js                                # semifinal (default)
//   node check.js --event=final
//   node check.js --event=final --add vividseats=7100
//   node check.js --dry                          # fetch, print, don't save

require('./proxy-boot'); // route fetch() through the egress proxy (re-execs if needed)

const fs = require('fs');
const path = require('path');
const EVENTS = require('./events');

const evArg = process.argv.find((a) => a.startsWith('--event='));
const EVENT = EVENTS[evArg ? evArg.split('=')[1] : 'semifinal'];
if (!EVENT) {
  console.error(JSON.stringify({ fatal: `unknown event; valid: ${Object.keys(EVENTS).join(', ')}` }));
  process.exit(1);
}

const DATA_FILE = path.join(__dirname, 'data', EVENT.key, 'prices.json');
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const SOURCES = EVENT.sources;

async function fetchFifaResale() {
  const res = await fetch('https://thegreatreviewer.com/api/seat-alerts/get-dashboard.php', {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const m = (data.matches || []).find((x) => x.matchId === EVENT.fifaMatchId);
  if (!m || !Number.isFinite(m.minPrice)) throw new Error('match not in dashboard');
  if (m.minPrice < 50 || m.minPrice > 100000) throw new Error(`implausible price ${m.minPrice}`);
  return Math.round(m.minPrice);
}

async function fetchLowPrice(key) {
  const src = SOURCES[key];
  const res = await fetch(src.url, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    redirect: 'follow',
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const m = html.match(/"lowPrice":\s*(\d+(?:\.\d+)?)/);
  if (!m) throw new Error('lowPrice not found in page');
  const price = parseFloat(m[1]);
  if (price < 50 || price > 100000) throw new Error(`implausible price ${price}`);
  return price;
}

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return {
      event: {
        title: EVENT.title,
        datetime: EVENT.datetime,
        venue: EVENT.venue,
      },
      sources: Object.fromEntries(
        Object.entries(SOURCES).map(([k, s]) => [
          k,
          { label: s.label, url: s.url, feesIncluded: s.feesIncluded },
        ])
      ),
      snapshots: [],
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const injected = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--add' && args[i + 1]) {
      const [name, val] = args[i + 1].split('=');
      injected[name] = parseFloat(val);
      i++;
    }
  }

  const prices = {};
  const errors = {};

  // Gametime is tracked as the cheapest listing ALL-IN price (their advertised
  // "from" price doesn't match their actual cheapest listing). Prefer fresh
  // listings.json (run fetch-listings.js first); fall back to the page regex.
  let gtFromListings = false;
  try {
    const lst = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', EVENT.key, 'listings.json'), 'utf8'));
    const gt = lst.listings.filter((l) => l.source === 'gametime');
    if (Date.now() - new Date(lst.fetchedAt) < 15 * 60 * 1000 && gt.length) {
      prices.gametime = Math.min(...gt.map((l) => l.allIn));
      gtFromListings = true;
    }
  } catch {}

  for (const key of Object.keys(SOURCES)) {
    if (key in injected) {
      prices[key] = injected[key];
      continue;
    }
    if (SOURCES[key].manual || (key === 'gametime' && gtFromListings)) continue;
    try {
      prices[key] = key === 'fifaresale' ? await fetchFifaResale() : await fetchLowPrice(key);
    } catch (e) {
      errors[key] = e.message;
    }
  }

  const data = loadData();
  const prev = data.snapshots[data.snapshots.length - 1];
  const snapshot = { ts: new Date().toISOString(), prices };

  const valid = Object.entries(prices).filter(([, v]) => Number.isFinite(v));
  const cheapest = valid.length
    ? valid.reduce((a, b) => (b[1] < a[1] ? b : a))
    : null;

  let prevCheapest = null;
  if (prev) {
    const pv = Object.entries(prev.prices).filter(([, v]) => Number.isFinite(v));
    if (pv.length) prevCheapest = pv.reduce((a, b) => (b[1] < a[1] ? b : a));
  }

  const allTimeLow = data.snapshots.reduce((min, s) => {
    for (const v of Object.values(s.prices))
      if (Number.isFinite(v) && (min === null || v < min)) min = v;
    return min;
  }, null);

  if (!Object.keys(prices).length) {
    console.error(JSON.stringify({ fatal: 'no prices fetched (network down?)', errors }));
    process.exit(1);
  }

  if (!dry) {
    data.snapshots.push(snapshot);
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 1));
  }

  const report = {
    event: EVENT.key,
    saved: !dry,
    snapshotCount: data.snapshots.length,
    prices,
    errors,
    cheapest: cheapest
      ? { source: SOURCES[cheapest[0]].label, price: cheapest[1], url: SOURCES[cheapest[0]].url }
      : null,
    prevCheapest: prevCheapest ? { source: prevCheapest[0], price: prevCheapest[1] } : null,
    drop:
      cheapest && prevCheapest ? +(prevCheapest[1] - cheapest[1]).toFixed(2) : null,
    newAllTimeLow:
      cheapest && allTimeLow !== null && cheapest[1] < allTimeLow ? cheapest[1] : null,
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(JSON.stringify({ fatal: e.message }));
  process.exit(1);
});

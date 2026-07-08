#!/usr/bin/env node
// Price checker for Argentina vs Switzerland — World Cup QF (Match 100)
// Sat Jul 11 2026, 8:00 PM — GEHA Field at Arrowhead Stadium, Kansas City
//
// Fetches lowest listed price from TickPick and Gametime (their event pages
// embed a "lowPrice" JSON field). Sources that block scripted fetches
// (Vivid Seats, SeatGeek) can be injected via --add name=price.
//
// Usage:
//   node check.js                                # fetch + append snapshot
//   node check.js --add vividseats=1608 --add seatgeek=2118
//   node check.js --dry                          # fetch, print, don't save

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data', 'prices.json');
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const SOURCES = {
  tickpick: {
    label: 'TickPick',
    url: 'https://www.tickpick.com/buy-fifa-world-cup-26-quarter-finals-w95-vs-w96-match-100-tickets-arrowhead-stadium-7-11-26-8pm/6259639/',
    feesIncluded: true,
  },
  gametime: {
    label: 'Gametime',
    url: 'https://gametime.co/fifa/fifa-world-cup-w95-vs-w96-match-100-quarter-final-tickets/7-11-2026-kansas-city-mo-geha-field-at-arrowhead-stadium/events/66ac1f15ba6c613e111c87d3',
    feesIncluded: false,
  },
  vividseats: {
    label: 'Vivid Seats',
    url: 'https://www.vividseats.com/world-cup-soccer-tickets-geha-field-at-arrowhead-stadium-7-11-2026--sports-soccer/production/5080868',
    feesIncluded: true,
    manual: true, // blocks scripted fetches; injected via --add
  },
  seatgeek: {
    label: 'SeatGeek',
    url: 'https://seatgeek.com/fifa-world-cup-tickets/international-soccer/2026-07-11-8-pm/17196238',
    feesIncluded: false,
    manual: true,
  },
};

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
        title: 'Argentina vs Switzerland — World Cup Quarterfinal (Match 100)',
        datetime: '2026-07-11T20:00:00-05:00',
        venue: 'GEHA Field at Arrowhead Stadium, Kansas City, MO',
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
  for (const key of Object.keys(SOURCES)) {
    if (key in injected) {
      prices[key] = injected[key];
      continue;
    }
    if (SOURCES[key].manual) continue;
    try {
      prices[key] = await fetchLowPrice(key);
    } catch (e) {
      errors[key] = e.message;
    }
  }

  // Gametime page fetch is occasionally flaky; fall back to the latest
  // listings snapshot (min pre-fee price) if it is under 2 hours old.
  if (!('gametime' in prices)) {
    try {
      const lst = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'listings.json'), 'utf8'));
      if (Date.now() - new Date(lst.fetchedAt) < 2 * 3600 * 1000 && lst.listings.length) {
        prices.gametime = Math.min(...lst.listings.map((l) => l.prefee));
        errors.gametime = (errors.gametime || '') + ' (used listings fallback)';
      }
    } catch {}
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

  if (!dry) {
    data.snapshots.push(snapshot);
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 1));
  }

  const report = {
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

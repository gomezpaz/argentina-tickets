#!/usr/bin/env node
// Fetch per-listing inventory for the ENG-ARG semifinal from Gametime's event page
// (embedded window.__data redux state) and compute group-seating options
// for a party of 8: all together, 4+4, and cheapest-any-split.
//
// Writes data/listings.json (latest only, overwritten each run).
// Prices are per-ticket. `allIn` includes Gametime fees; `prefee` doesn't.

require('./proxy-boot'); // route fetch() through the egress proxy (re-execs if needed)

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'data', 'listings.json');
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const EVENT_URL =
  'https://gametime.co/fifa/fifa-world-cup-match-102-semi-final-tickets/7-15-2026-atlanta-ga-mercedes-benz-stadium/events/66a7e8a5218fbd1123388be7';
const PARTY = 8;

async function fetchGametimeListings() {
  const res = await fetch(EVENT_URL, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    redirect: 'follow',
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`gametime HTTP ${res.status}`);
  const html = await res.text();
  const start = html.indexOf('window.__data');
  if (start === -1) throw new Error('window.__data not found');
  const eq = html.indexOf('=', start);
  const end = html.indexOf('</script>', eq);
  const blob = html.slice(eq + 1, end).trim();
  const win = {};
  new Function('window', 'window.__data=' + blob)(win);
  const raw = win.__data?.redux?.listings?.listings;
  if (!Array.isArray(raw)) throw new Error('listings array not found in redux state');
  return raw
    .filter((l) => l?.price?.total && l?.spot)
    .map((l) => ({
      id: l.id,
      source: 'gametime',
      section: l.spot.section,
      sectionGroup: l.spot.sectionGroup || '',
      row: l.spot.row,
      lots: l.availableLots || [],
      allIn: Math.round(l.price.total) / 100,
      prefee: Math.round(l.price.prefee) / 100,
      x: l.spot.position?.x ?? null,
      y: l.spot.position?.y ?? null,
      view: l.spot.viewUrl || null,
      url: l.seoUrl || EVENT_URL,
    }));
}

// FIFA official resale seats (crowdsourced scans via thegreatreviewer.com).
// Individual seats are grouped into runs of adjacent seats (same block+row,
// consecutive numbers, same category) so they participate in group combos.
async function fetchFifaSeats() {
  const res = await fetch('https://thegreatreviewer.com/api/seat-alerts/get-dashboard.php', {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`fifa HTTP ${res.status}`);
  const data = await res.json();
  const m = (data.matches || []).find((x) => x.matchId === '10229226725358');
  if (!m || !Array.isArray(m.seats) || !m.seats.length) throw new Error('no fifa seat data');

  const byRow = {};
  for (const s of m.seats) {
    if (!Number.isFinite(s.price) || s.price < 50) continue;
    (byRow[`${s.block}|${s.row}`] ||= []).push({ ...s, seatNum: parseInt(s.seat, 10) || 0 });
  }
  const listings = [];
  for (const arr of Object.values(byRow)) {
    arr.sort((a, b) => a.seatNum - b.seatNum);
    let run = [arr[0]];
    const flush = () => {
      const n = run.length;
      const avg = run.reduce((sum, x) => sum + x.price, 0) / n;
      listings.push({
        id: `fifa-${run[0].block}-${run[0].row}-${run[0].seatNum}${n > 1 ? '-x' + n : ''}`,
        source: 'fifaresale',
        section: String(run[0].block),
        sectionGroup: run[0].category,
        row: String(run[0].row),
        seat: n > 1 ? `${run[0].seatNum}-${run[n - 1].seatNum}` : String(run[0].seatNum),
        category: run[0].category,
        lots: Array.from({ length: n }, (_, i) => i + 1),
        allIn: +avg.toFixed(2),
        prefee: +avg.toFixed(2),
        x: null,
        y: null,
        view: null,
        url: run[0].buyUrl || 'https://tickets.fifa.com/',
      });
    };
    for (let i = 1; i < arr.length; i++) {
      const prev = run[run.length - 1];
      if (arr[i].seatNum === prev.seatNum + 1 && arr[i].category === prev.category) run.push(arr[i]);
      else { flush(); run = [arr[i]]; }
    }
    flush();
  }
  return listings;
}

function dist(a, b) {
  if (a.x == null || b.x == null) return Infinity;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function computeCombos(listings) {
  // 8 seats together in one listing
  const together8 = listings
    .filter((l) => l.lots.some((q) => q >= PARTY))
    .sort((a, b) => a.allIn - b.allIn)
    .slice(0, 8);

  // 4 + 4 across two listings, ranked by total price; annotate proximity
  const fours = listings
    .filter((l) => l.lots.includes(4))
    .sort((a, b) => a.allIn - b.allIn)
    .slice(0, 40); // cap pair search space
  const pairs = [];
  for (let i = 0; i < fours.length; i++)
    for (let j = i + 1; j < fours.length; j++) {
      const a = fours[i], b = fours[j];
      const d = dist(a, b);
      pairs.push({
        listings: [a.id, b.id],
        totalAllIn: +(4 * a.allIn + 4 * b.allIn).toFixed(2),
        perTicketAvg: +((a.allIn + b.allIn) / 2).toFixed(2),
        sameSection: a.section === b.section,
        distance: Number.isFinite(d) ? Math.round(d) : null,
        label: `Sec ${a.section} row ${a.row} + Sec ${b.section} row ${b.row}`,
      });
    }
  const split44cheapest = pairs.sort((x, y) => x.totalAllIn - y.totalAllIn).slice(0, 8);
  const split44closest = pairs
    .filter((p) => p.distance !== null)
    .sort((x, y) => x.distance - y.distance || x.totalAllIn - y.totalAllIn)
    .slice(0, 8);

  // cheapest any-split: greedily take cheapest listings by max usable lot
  const byPrice = [...listings].sort((a, b) => a.allIn - b.allIn);
  let need = PARTY;
  const parts = [];
  for (const l of byPrice) {
    if (need <= 0) break;
    const usable = Math.max(...l.lots.filter((q) => q <= need), 0);
    if (!usable) continue;
    parts.push({ id: l.id, take: usable, allIn: l.allIn, label: `${usable} in Sec ${l.section} row ${l.row}` });
    need -= usable;
  }
  const anySplit =
    need <= 0
      ? {
          parts,
          totalAllIn: +parts.reduce((s, p) => s + p.take * p.allIn, 0).toFixed(2),
        }
      : null;

  return { together8, split44cheapest, split44closest, anySplit };
}

async function main() {
  const results = await Promise.allSettled([fetchGametimeListings(), fetchFifaSeats()]);
  const gametime = results[0].status === 'fulfilled' ? results[0].value : [];
  const fifa = results[1].status === 'fulfilled' ? results[1].value : [];
  for (const r of results) if (r.status === 'rejected') console.error(JSON.stringify({ warn: r.reason.message }));
  const listings = [...gametime, ...fifa];
  if (!listings.length) throw new Error('all listing sources failed');
  const combos = computeCombos(listings);
  const out = {
    fetchedAt: new Date().toISOString(),
    party: PARTY,
    counts: { gametime: gametime.length, fifaresale: fifa.length },
    combos,
    listings: listings.sort((a, b) => a.allIn - b.allIn),
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(
    JSON.stringify(
      {
        listings: listings.length,
        cheapestAllIn: listings[0] ? Math.min(...listings.map((l) => l.allIn)) : null,
        together8: combos.together8.length,
        best44: combos.split44cheapest[0] || null,
        anySplitTotal: combos.anySplit?.totalAllIn ?? null,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(JSON.stringify({ fatal: e.message }));
  process.exit(1);
});

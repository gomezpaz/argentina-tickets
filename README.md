# ARG Ticket Watch

Mobile-first dashboard tracking the cheapest resale tickets for two matches
(switchable in the dashboard header; config in `events.js`):

- **England vs Argentina — World Cup Semifinal (Match 102)** — Wed Jul 15
  2026, 3:00 PM, Mercedes-Benz Stadium, Atlanta
- **World Cup Final (Match 104)** — Sun Jul 19 2026, 3:00 PM, MetLife
  Stadium, East Rutherford, NJ

(Previously tracked the ARG-SUI quarterfinal — that data is archived in
`data/archive/`.)

## Run

```bash
node server.js                 # serves dashboard on http://localhost:4321
node check.js                  # semifinal snapshot -> data/semifinal/prices.json
node check.js --event=final    # final snapshot -> data/final/prices.json
node watch.js                  # 5-min loop over both events
```

Open from your phone (same wifi): `http://<your-mac-lan-ip>:4321`

## Sources

| Source | Method | Notes |
|---|---|---|
| TickPick | scripted fetch (`"lowPrice"` in page HTML) | fees included |
| Gametime | scripted fetch (`"lowPrice"` in page HTML) | + fees |
| Vivid Seats | blocks scripts; injected via `--add vividseats=<price>` | fees included |
| SeatGeek | blocks scripts + headless browsers (Kasada) | pending |
| FIFA Resale | thegreatreviewer.com/api/seat-alerts/get-dashboard.php (crowdsourced FIFA marketplace scans; matchIds in events.js) | official resale |

## Reference links

- FIFA resale tracker (all 104 matches): https://thegreatreviewer.com/wc-tracker/
- Historical price data (QF, Match 100): https://www.ticketdata.com/events/855407 (Cloudflare-walled to scripts; open in a browser)

```bash
node check.js --add vividseats=2933
node check.js --event=final --add vividseats=6983
node check.js --dry     # fetch + print without saving
```

`check.js` prints a JSON report with the current cheapest listing, the delta
vs the previous check, and whether it's a new all-time low.

## Data

`data/<event>/prices.json` — one snapshot per check: `{ts, prices: {source: lowestPrice}}`.
`data/<event>/listings.json` — latest per-listing inventory + group-of-8 combos.
The dashboard (`index.html`) charts the full history and auto-refreshes every 60s.

## Notifications

The Claude Code loop runs `check.js` on a ~30 min cadence and sends a push
notification when the cheapest price drops meaningfully (≥$25) or hits a new
all-time low. For true SMS, wire Twilio credentials into the loop
(TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / from+to numbers).

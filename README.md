# ARG Ticket Watch

Mobile-first dashboard tracking the cheapest resale tickets for
**Argentina vs Switzerland — World Cup Quarterfinal (Match 100)**,
Sat Jul 11 2026, 8:00 PM, GEHA Field at Arrowhead Stadium, Kansas City.

## Run

```bash
node server.js          # serves dashboard on http://localhost:4321
node check.js           # fetch prices + append snapshot to data/prices.json
```

Open from your phone (same wifi): `http://<your-mac-lan-ip>:4321`

## Sources

| Source | Method | Notes |
|---|---|---|
| TickPick | scripted fetch (`"lowPrice"` in page HTML) | fees included |
| Gametime | scripted fetch (`"lowPrice"` in page HTML) | + fees |
| Vivid Seats | blocks scripts; injected via `--add vividseats=<price>` | fees included |
| SeatGeek | blocks scripts + headless browsers (Kasada) | pending |
| FIFA Resale | thegreatreviewer.com/api/seat-alerts/get-dashboard.php (crowdsourced FIFA marketplace scans, matchId 10229226725356) | official resale |

## Reference links

- FIFA resale tracker (all 104 matches): https://thegreatreviewer.com/wc-tracker/
- Historical price data for this match: https://www.ticketdata.com/events/855407 (Cloudflare-walled to scripts; open in a browser)

```bash
node check.js --add vividseats=1608 --add seatgeek=2118
node check.js --dry     # fetch + print without saving
```

`check.js` prints a JSON report with the current cheapest listing, the delta
vs the previous check, and whether it's a new all-time low.

## Data

`data/prices.json` — one snapshot per check: `{ts, prices: {source: lowestPrice}}`.
The dashboard (`index.html`) charts the full history and auto-refreshes every 60s.

## Notifications

The Claude Code loop runs `check.js` on a ~30 min cadence and sends a push
notification when the cheapest price drops meaningfully (≥$25) or hits a new
all-time low. For true SMS, wire Twilio credentials into the loop
(TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / from+to numbers).

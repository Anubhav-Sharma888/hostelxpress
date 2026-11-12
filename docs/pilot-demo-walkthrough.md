# After Hours pilot — demo walkthrough (local, ~5 minutes)

Everything below runs on the local demo stack: private PostgreSQL, simulated payments, no real merchants, money, or hardware. Seed the pilot fixtures and boot:

```bash
source .tools/env.sh
bash scripts/run_demo.sh          # app on http://localhost:8081, API on :8000
PGB=/usr/lib/postgresql/17/bin
PGHOST="$PWD/.tools/demo/socket" PGPORT=55434 PGUSER=postgres PGDATABASE=hostelxpress_demo \
  "$PGB/psql" -X -f .tools/seed-pilot-demo.sql   # opens the schedule window, provisions 2 merchants + departures
```

The automated browser journey `tests/e2e/specs/pilot.spec.mjs` (`npx playwright test specs/pilot.spec.mjs`) covers the same steps.

## Walkthrough

1. **Sign in** on the landing screen (demo mode: name + hostel block only, e.g. "Pilot Student" / C).
2. **After Hours** — the dark card on Home. The schedule card shows the backend-owned window (default 01:30–03:30 Asia/Kolkata; the seed opens it around "now") and both fees (₹10 tuck / ₹20 hot food).
3. **Tuck Shop Express** — Browse and order → add "Test paratha" → the cart shows items, the ₹10 delivery fee, and the total **before** confirmation → "Get quote and confirm" places the order from a server-frozen quote (10-minute validity) → **Simulate payment**.
4. **Merchant queue** — After Hours → Open merchant queue → paste the staff token `demo-staff-tuck` (demo-only value from the seed). Accept → Mark ready → Request rover (refuses before payment) → Confirm loaded. The order leaves the queue's active states per its status pill.
5. **Isolation** — paste the hot-canteen token `demo-staff-hot`: the tuck order is not visible; actions 404. Restore the tuck token to see the order again.
6. **Hot food** — After Hours → "Late Night Canteen" → add "Hot chai" + "Midnight maggi" (₹260 items) → checkout shows the **₹20** delivery fee and **₹280** total → confirm → pay. The merchant accepts and the backend assigns **Bay 01 · Insulated** — the badge appears on the merchant card and the order only after that assignment.
7. **Parcel tracking unchanged** — "Parcel tracking" opens the existing deliveries journal; the Gate 2 ₹10 parcel journey is a separate flow (`tests/e2e/specs/delivery.spec.mjs`, 6 journeys).

## What the demo does NOT do

No real money (simulated checkout only), no physical rover dispatch, no live merchants (both are seed fixtures), no email/password sign-up (demo mode is name-only), and departure/safety decisions stay with the backend — the UI only displays them.

## Acceptance checks already automated

- 1:30 AM boundary gates hot-food quoting (API test: closed → 409, open → 200).
- Quotes freeze items + fee; price changes after quoting never change the charge; expired quotes (10 min) are refused server-side.
- Capacity: a full departure refuses a second order with "the last compartment was just claimed"; rejection frees capacity.
- Merchant tokens cannot see or act on another merchant's orders.
- Payment (`SimPaid`) never advances the fulfilment status; rover dispatch requires payment; loading confirmation is a separate fact.

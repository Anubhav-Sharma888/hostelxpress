# First live backend run — independently verifiable steps

Prepared 19 November 2026. Each step below passes or fails on its own printed
evidence and does not depend on any later step. No secret values belong in this
file, in command output, or in Git; everything listed is a configuration *name*.

Operator inputs (held by you, never in the repo): Supabase project URL +
publishable key, a dedicated `DATABASE_URL` role with RLS bypass, Razorpay key
pair + webhook secret (after KYC), one real student sign-in for the token
check, and an enrolled rover with its signed connector secret (robotics team).

## Step 1 — Supabase project health (read-only, no app, no backend)

```bash
HOSTELXPRESS_CHECK_SUPABASE=1 SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... \
HOSTELXPRESS_SUPABASE_TEST_TOKEN=<student JWT> python3 scripts/check_supabase.py
```

Pass: Auth JWKS reachable, publishable key accepted, schema/RLS/migrations
present, and one real token verifies against the production path.
Does NOT prove: the API is running, booking works, or payment is configured.

**Stop if it fails:** fix the Supabase project (run `supabase/init.sql` then
each migration in filename order) before any later step.

## Step 2 — API process health (production mode, no app)

```bash
APP_ENV=production uvicorn app.main:app --host 0.0.0.0 --port 8000
curl -fsS https://<api-host>/health
```

Pass: `/health` returns `{"status":"ok","mode":"production",...}` from a
non-loopback client; demo routes are absent in production.
Does NOT prove: sign-in works end-to-end or that the database has bookable
fixtures.

**Stop if it fails:** backend runtime configuration (`APP_ENV`,
`SUPABASE_URL`, `DATABASE_URL`, `TRUSTED_HOSTS`, `CORS_ORIGINS`) is the
dependency; fix before Step 3.

## Step 3 — Real sign-in through the app (needs Steps 1–2)

Build/start the app in real mode (`EXPO_PUBLIC_SUPABASE_URL` +
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` + HTTPS `EXPO_PUBLIC_API_URL`) and sign
in with a real Supabase student account.

Pass: Home renders with the real profile; no QA-preview controls appear;
Profile shows the signed-in student; sign-out and repeat sign-in both work.
Does NOT prove: booking (Step 4) or anything hardware-related.

**Stop if it fails:** the Supabase email/password provider and the app's
real-mode env are the dependencies.

## Step 4 — Live booking (needs Step 3)

Book a Delivery → residence + Room/Wing + AWB → **Confirm & Dispatch Rover**.

Pass: an order is created with status `Pending`; a retry with the same
idempotency key returns the same order; a changed retry returns 409.

**This is the booking stop point.** Without a rover, nothing further can
happen: dispatch requires a bot with fresh, closed/empty telemetry, and arrival
is a physical event the backend only records. Do not simulate arrival
server-side; the order legitimately stays `Pending`.

## Steps after the stop point (each has its own dependency)

| Step | Needs | Why |
| --- | --- | --- |
| Dispatch → transit → arrival | **enrolled rover** (robotics team, `provision-bot` + signed connector, fresh telemetry) | the backend records arrival only from signed device events |
| Payment QR creation | arrival (rover) + **Razorpay KYC** | the QR is a single-use Razorpay object for exactly ₹10 |
| Webhook confirmation | Razorpay webhook registered at `/webhooks/razorpay` | server-side capture verification |
| Unlock → collection → completion | enrolled rover | payment authorizes the unlock request; only the rover confirms physical unlock |

## Failure handling

- Ambiguous QR creation: inspect the saved request ID before resolving; a
  retry never blindly creates a second QR.
- Signed payment failure: parcel retained, incident recorded (last 120 s of
  evidence), bot enters FAULT_MODE — operator runbook territory.
- Booking 5xx uncertainty: re-check the order list before retrying; duplicate
  protection holds only while the idempotency key is unchanged.

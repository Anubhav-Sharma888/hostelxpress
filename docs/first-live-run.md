# First live backend run — independently verifiable steps

Prepared 19 November 2026. Each step below passes or fails on its own printed
evidence and does not depend on any later step. No secret values belong in this
file, in command output, or in Git; everything listed is a configuration *name*.

Use a staging Supabase project and an HTTPS FastAPI host for the first run.
The app build uses the project URL, Supabase publishable key, HTTPS API URL,
and `EXPO_PUBLIC_SUPPORT_PHONE` (international format, visible to app users).
Store the dedicated database connection, Razorpay test keys and webhook secret,
and hardware credentials only in their respective server or device environments.

## Step 1 — Supabase project health (read-only, no app, no backend)

```bash
HOSTELXPRESS_CHECK_SUPABASE=1 python3 scripts/check_supabase.py
```

Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_DB_URL` in the
environment or ignored checkout-root `.env`. With all three configured, require
successful Auth health, a publishable-key check, and `schema_and_rls: passed`.
The optional `HOSTELXPRESS_SUPABASE_TEST_TOKEN` needs a student JWT and can be
checked after sign-in.

**Stop if it fails:** fix the Supabase project (run `supabase/init.sql` then
each migration in filename order) before any later step.

## Step 2 — API process health (production mode, no app)

```bash
APP_ENV=production PYTHONPATH=services/api uvicorn app.main:app --host 0.0.0.0 --port 8000
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

Use email/password on the sign-in screen. Skip sign-in remains available for
offline QA. Require Home and Profile to show the real student after real sign-in,
then verify sign-out and repeat sign-in.
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
| Payment QR creation | arrived order + Razorpay test credentials and QR support | the QR is a single-use Razorpay object for exactly ₹10 |
| Webhook confirmation | test-mode webhook at `/webhooks/razorpay` with the matching test webhook secret and `qr_code.credited` enabled | signed server-side capture and QR verification |
| Live payments | merchant onboarding and live QR activation | use separate live credentials and a separate live webhook after the test passes |
| OTP 2 → unlock → collection → completion | enrolled rover, captured ₹10, signed device requests and deployed OTP 2 schema | the student receives a HostelXpress pickup code and enters it on the rover; only verified OTP 2 plus payment can queue the correct inner-lid command; the rover separately confirms execution and safe closure |

Use test credentials to check provider setup and keep real money out of staging. The known merchant TEST account can list QRs but creation was rejected; never repeat creation calls without new permission/capability evidence. OTP 1 / OTP 2 operations remain disabled in the existing restricted staging service unless a separately approved full integration environment is provisioned.
Razorpay's documentation limits scanning QR Codes to live mode. Use application
fixtures for the offline QR and capture rehearsal, then verify a controlled live
scan separately once merchant onboarding and live QR activation are complete.

## Live tracking acceptance

The enrolled rover publishes GPS, battery and compartment telemetry to the TLS
MQTT broker and posts signed delivery events to the HTTPS API. The API stores
the latest valid fix and order state in PostgreSQL. The signed-in app polls its
own orders about every five seconds while active. On a real active order,
compare the displayed GPS fix to known rover coordinates, then pause telemetry
and verify that the fix becomes unavailable. The campus route drawing is a
delivery-stage schematic. A moving pin requires a georeferenced campus map.

## Failure handling

- Ambiguous QR creation: inspect the saved request ID before resolving; a
  retry never blindly creates a second QR.
- Signed payment failure: parcel retained, incident recorded (last 120 s of
  evidence), bot enters FAULT_MODE — operator runbook territory.
- Booking 5xx uncertainty: re-check the order list before retrying; duplicate
  protection holds only while the idempotency key is unchanged.

# Phase 2 plan: live authentication/payment configuration and backend hardening

Authorized by the user on 28 October 2026. Goal: the backend is genuinely configured for and validated against the real providers — Supabase Auth, Razorpay, HiveMQ — with hardening in place, while the local demo remains untouched. Nothing here charges money or enables live traffic until the user says so.

## Security rules for credentials

1. The user creates accounts and generates keys **manually** and stores them in the untracked `.env` file at the root of the WSL checkout (`/home/anubhav_sharma_888/src/hostelxpress/.env`). It is gitignored, never committed, and never synced to the Windows mirror. Secrets are never pasted into chat, screenshots, or logs.
2. The backend now loads `.env` automatically (`services/api/app/config.py`); OS environment variables still win, so the demo runner's exported values are unaffected.
3. Test/sandbox keys only in this phase. Live keys are a later, explicit decision.

## Already implemented (no credentials required)

| Change | Where |
| --- | --- |
| Operator `.env` is loaded by the backend | `services/api/app/config.py` |
| Failure throttle (429) on unauthenticated device-message and webhook attempts, shielding the database from garbage floods | `services/api/app/throttle.py`, hooked in `main.py` and `devices.py` |
| Security headers on every response (`nosniff`, `no-referrer`) plus `no-store` + strict CSP on API paths | `services/api/app/main.py` |
| Startup warnings naming each unconfigured production integration (fails closed, never silently degraded) | `services/api/app/main.py` `warn_unconfigured` |
| Opt-in Supabase check: JWKS reachability/algorithms, publishable-key acceptance, optional schema/RLS/migration verification over a protected connection, optional real-token verification | `scripts/check_supabase.py` |
| Opt-in Razorpay sandbox check: key authentication, one ₹10 single-use UPI QR created/verified/closed exactly as the backend does; refuses live keys | `scripts/check_razorpay.py` |
| Requeued reservations are re-reserved onto an available bot with their original rider deadline (previously they could never reach a bot again); covered by a new journey test | `services/api/app/service.py`, `tests/test_journey.py` |
| Dead `DeviceMessage` pydantic model removed (unused, and its event names contradicted the wire contract) | `services/api/app/models.py` |
| Documentation staleness from publication fixed (git/CI state in README and phase reviews, API destination-validation wording) | `README.md`, `docs/phase1-review.md`, `contracts/http/openapi-notes.md` |
| CI now runs the app lint step | `.github/workflows/phase1.yml` |

## What the user must create (manual checklist)

### 1. Supabase project (~10 minutes)

1. Sign up at supabase.com and create one project (any name, e.g. `hostelxpress`); save the database password somewhere safe.
2. Put these in `.env` (Project Settings → API):
   - `SUPABASE_URL=https://YOUR_PROJECT.supabase.co`
   - `SUPABASE_PUBLISHABLE_KEY=<anon/public key>`
   - `SUPABASE_SECRET_KEY=<service_role key>` (backend only; later phases use it)
   - `SUPABASE_DB_URL=<connection string from Project Settings → Database>` (session pooler or direct; used to apply migrations)
3. Apply the schema, either:
   - paste `supabase/init.sql`, then `supabase/migrations/0001_application_core.sql`, then `0002_device_reconciliation.sql` into the SQL Editor in that order, **or**
   - let me apply them over `SUPABASE_DB_URL` with psql.
4. Create one test user in Authentication → Users (any email/password) and sign in once via the Supabase dashboard or the app later; put the resulting access token in `HOSTELXPRESS_SUPABASE_TEST_TOKEN` for the strongest check (optional).
5. Then run: `HOSTELXPRESS_CHECK_SUPABASE=1 python scripts/check_supabase.py`

**Observed 28 October 2026:** schema applied to the user's live project over the session pooler (password percent-encoded after their chosen password broke the raw URI). Full check passed: JWKS serves one asymmetric ES256 signing key, auth health 200, publishable key accepted, PostgreSQL 17.11, both migrations recorded, all four tables present with row level security enabled. The backend also booted in production mode against this live database: `/health` reported mode production, database ready, payments configured, MQTT disabled, and `/auth/demo` correctly returned 404.

### 2. Razorpay test account (~10 minutes)

1. Sign up at dashboard.razorpay.com; test mode is available immediately (activation/KYC can wait).
2. Account & Settings → API Keys → Generate **Test** key; put in `.env`:
   - `RAZORPAY_KEY_ID=rzp_test_...`
   - `RAZORPAY_KEY_SECRET=...`
3. `RAZORPAY_WEBHOOK_SECRET` comes later: the backend verifies it already, but the dashboard needs a **public HTTPS webhook URL** (a deployed backend, not a laptop). Choose the secret then and put it in `.env`.
4. Then run: `HOSTELXPRESS_CHECK_RAZORPAY=1 python scripts/check_razorpay.py`

**Observed 28 October 2026:** the user's test keys authenticate successfully (payments, orders, and customers APIs return 200), but `GET/POST /payments/qr_codes` returns Razorpay's route-not-found error for this account while the documented endpoint is unchanged. The practical cause is Razorpay gating UPI/QR features on account activation. **User action:** complete account activation (KYC: PAN, bank, business details) in the dashboard; rerun the check afterwards. The backend's payment-creation and webhook paths remain validated by provider doubles locally and need no change.

### 3. HiveMQ Cloud broker (~15 minutes)

1. Create a free Serverless (or Starter) cluster at hivemq.com; note the hostname and TLS port 8883.
2. Create two sets of credentials in Access Management (least privilege):
   - Publisher (backend command publisher): **Publish** allowed on `hostelxpress/v1/bots/+/commands` only.
   - Ingest (backend listener): **Subscribe** allowed on `hostelxpress/v1/bots/+/telemetry`, `/state`, `/events`, `/acks`, `/availability`.
3. Per-bot device credentials are generated later by `python -m app.cli provision-bot` (the CLI prints each secret once).
4. Put in `.env`: `MQTT_HOST`, `MQTT_PORT=8883`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `MQTT_INGEST_USERNAME`, `MQTT_INGEST_PASSWORD`, `MQTT_INGEST_CLIENT_ID=hostelxpress-backend-ingest`. HiveMQ Cloud uses standard public CAs, so `MQTT_CA_FILE` can stay unset.
5. The existing transport proof (`HOSTELXPRESS_MQTT_PROOF=1 bash scripts/check_mqtt_link.sh`) stays a local Mosquitto check; a HiveMQ-flavored live proof is written once the cluster exists.

## Verification this phase

- `python scripts/check_supabase.py` and `python scripts/check_razorpay.py` pass against the real projects (evidence recorded in the phase review).
- Full backend/connector/app/e2e suites stay green (hardening is covered by `services/api/tests/test_hardening.py`).
- The student app gains real Supabase sign-in only after the backend accepts real JWTs end-to-end; that lands with Phase 3's screen work or earlier if keys arrive quickly.

## Deliberately out of scope here

No public deployment/webhook URL yet (needs a host decision), no live-key switch, no camera storage, no OTP provider, no physical actuation. Local checks never substitute for the configured-environment validations above.

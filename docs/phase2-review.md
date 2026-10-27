# Phase 2 review record

Phase window: 28 October 2026. Phase 2 (live authentication/payment configuration and backend hardening) concluded by the user's explicit direction, with two items consciously deferred. Prepared for the Phase 3 gate.

## Delivered and observed

| Item | Evidence |
| --- | --- |
| Supabase project configured and schema deployed | `init.sql` + `0001_application_core` + `0002_device_reconciliation` applied over the session pooler; all four tables present, RLS enabled, migrations recorded (PostgreSQL 17.11) |
| Supabase Auth live-verified | JWKS serves one asymmetric ES256 signing key; auth health 200; publishable key accepted (`scripts/check_supabase.py`, opt-in) |
| Backend boots in real mode against the live project | `/health`: mode production, database ready, payments configured, MQTT disabled; `/auth/demo` correctly 404; secrets loaded from the operator `.env` |
| Razorpay keys verified live | test-key authentication passes against payments/orders/customers APIs (`scripts/check_razorpay.py`); **QR Codes API is route-absent for this account pending free account activation (KYC)** — rerun the check after activation |
| Operator credential flow | Untracked gitignored `.env` in the checkout, loaded by the backend (OS env wins); never committed, never synced to the Windows mirror (sync excludes `/.env`, verified) |
| Backend hardening | Failure throttle (429) on unauthenticated device/webhook floods; security headers + `no-store`/CSP on API paths; startup warnings naming unconfigured integrations; fail-closed semantics unchanged |
| Reconciliation fix (QA-agent finding) | Requeued reservations are re-reserved onto an available bot with their original rider deadline, with journey-test coverage; dead `DeviceMessage` model removed; README/CI staleness fixed; CI runs the app lint |
| MQTT decision | No cloud broker: HiveMQ free tier closed to new signups; local Mosquitto TLS proof validates the full path; campus pilot co-locates Mosquitto with the backend on the campus LAN; any future hosted broker is an env-var change only |

All commits on `main` at github.com/Anubhav-Sharma888/hostelxpress; CI green throughout. Zero cost: Supabase Free, Razorpay test mode, no card used anywhere.

## Consciously deferred (user decision, 28 October 2026)

1. **Interactive real-token test**: create a test user, perform one real Supabase sign-in, and verify the production JWT path end-to-end (sign-in → JWKS-verified token → authenticated API call). The server-side prerequisites are all verified; only the interactive step is pending. This folds into Phase 3's real sign-in work naturally.
2. **Razorpay QR live check**: pending the user's free account activation in the Razorpay dashboard.

## Not established in Phase 2

Live webhook delivery (needs a public HTTPS backend URL), UPI QR creation on the real provider, MQTT over a public broker, camera storage, OTP provider integration, physical actuation. Local provider doubles and the Mosquitto proof validate application behavior, not provider connectivity.

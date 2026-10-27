# Application backend

Run this service in Ubuntu Linux. The canonical checkout is `/home/anubhav_sharma_888/src/hostelxpress`. It implements the student application API and hardware communication boundary; it contains no navigation, firmware, or actuator implementation.

## Local application demonstration

Use the repository's `scripts/run_demo.sh` to prepare its private PostgreSQL database and start the application. To start only the API after the database is ready:

```bash
source .tools/env.sh
export APP_ENV=demo
export DATABASE_URL='host=/home/anubhav_sharma_888/src/hostelxpress/.tools/demo/socket port=55434 dbname=hostelxpress_demo user=postgres'
PYTHONPATH=services/api .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Install the exact runtime resolution with `python -m pip install -r services/api/requirements.txt`. Tests additionally use `requirements-dev.txt`. `requirements.in` records direct dependency constraints; the pinned files record the actual compatible Linux/Python 3.10 resolution.

Demo mode accepts only local requests and a local database containing the minimal Auth fixture. It refuses a real Supabase Auth schema. Each login creates a separate local student and a signed six-hour session. Signing keys are random per process by default; restarting invalidates local sessions. Run a single demo API process. The example hostel labels A–G and bot coordinates are fixtures, not surveyed campus information.

All demo physical steps are explicit local simulator operations. They never connect to MQTT or Razorpay, accept live device events, issue a live actuator command, or move money. The QR encodes `HOSTELXPRESS_DEMO_NONPAYABLE:...`; it is not a UPI payment address. Demo operations produce synthetic heartbeat/sensor observations. An idle screen can show an old simulated heartbeat. `dispatch` explicitly evaluates the five-minute batch deadline, and `load` simulates an authorized outer-lid attempt and confirmed parcel placement. The third loaded compartment dispatches immediately.

## Schema and database credentials

On a fresh Supabase project, run `supabase/init.sql`, then each file in `supabase/migrations/` in filename order. Each migration is transactional and records its version. Do not run the disposable `bootstrap_local_auth.sql` fixture against Supabase.

The backend uses PostgreSQL through psycopg. `DATABASE_URL` accepts a libpq connection string or PostgreSQL URI. For deployment use a dedicated server database role with the necessary application-table/private-schema rights and RLS bypass, kept exclusively in the backend secret store; do not use the student JWT as a database password. Local demo/test uses its private user-owned cluster's `postgres` role. Use authenticated TLS for a remote database, with the deployment's CA and hostname verification. Never place connection credentials in a frontend bundle, command log, or Git.

The database and API jointly enforce reservations. `compartment_released_at` ends physical custody; merely setting Failed or Completed does not free the compartment. Booking keys are scoped to a student and bound to a request fingerprint. A retry returns the same order; changed details with the same key return 409. Backend mutation paths lock bots before orders and use parameterized queries. Profile changes do not reroute existing orders. Terminal order responses hide live bot coordinates.

## Production authentication

Set `APP_ENV=production`, an HTTPS `SUPABASE_URL`, `DATABASE_URL`, `TRUSTED_HOSTS`, and `CORS_ORIGINS` for the deployed app. The backend validates Supabase asymmetric JWTs against the project's fixed JWKS endpoint, issuer, authenticated audience, expiry, subject UUID, and role. RS256/ES256 are accepted; legacy HS256 token verification is intentionally disabled. A client-supplied user ID is never authorization. Demo routes are unavailable in production. Configure the student's Supabase sign-in in the app before production use; local demo sessions are not a substitute for it.

## Razorpay

Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and a separate `RAZORPAY_WEBHOOK_SECRET`. The backend creates a single-use, fixed-amount UPI QR for exactly INR 1,000 paise. A durable creating intent is committed before the external request. If the request times out or the process crashes, creation remains pending reconciliation; a retry never blindly creates another QR. Investigate the saved request ID and provider QR notes before resolving an ambiguous intent.

Point the configured provider webhook at HTTPS `/webhooks/razorpay`. Signature verification uses the exact raw bytes and constant-time HMAC comparison before parsing. The backend checks the provider payment's captured state, exact amount/currency, and its QR relationship using authenticated provider API reads. Razorpay QR payments can have no Orders API order ID. Event-ID deduplication and order/payment business effects are independent. Payment, order status, inbox receipt, and pending unlock are committed together. A signed payment failure retains the parcel, records an incident requiring the last 120 seconds of evidence, and puts the bot in FAULT_MODE. A captured payment on a terminal order records the financial fact for reconciliation and never unlocks that parcel automatically.

Actual Razorpay merchant capability, QR product availability, webhook delivery, test/live separation, and merchant fees require connected sandbox verification. Local tests use provider doubles and prove the application's validation paths, not Razorpay connectivity.

## Hardware connector and MQTT

The drop-in adapter and its usage are described in `docs/hardware-handoff.md`. Its canonical payloads are `contracts/mqtt/wire.schema.json`; signed HTTP and MQTT share the same codec. Provision a bot from an operator terminal:

```bash
PYTHONPATH=services/api DATABASE_URL='your protected server connection' \
  .venv/bin/python -m app.cli provision-bot --bot-id YOUR_BOT_UUID
```

The provisioning CLI intentionally prints the newly generated per-bot HMAC secret once. Save it in the connector's secret store and protect the terminal; never commit it. `--rotate` explicitly replaces an existing credential. Newly provisioned sensors start unknown, so the bot cannot receive reservations until fresh, synchronized, closed/empty compartment telemetry arrives.

`POST /v1/devices/{bot_id}/messages` accepts at most 16 KiB. Sign the exact body using `X-Device-Timestamp` (Unix seconds) and `X-Device-Signature`:

```text
HMAC_SHA256(device_secret, timestamp + '.POST.' + request_path + '.' + raw_body)
```

The signature's request timestamp must be within 30 seconds. Payload identity must match the provisioned bot. Device message IDs are durable deduplication keys. Telemetry is monotonic within a boot, and retired boot IDs cannot resume. Only a complete three-field compartment snapshot updates its observation timestamp, using the validated device observed_at rather than the transport receipt time. A delayed observation remains old; a partial event cannot certify old untouched sensor values as fresh. Confirmed collection also requires a fresh target snapshot and a healthy current device.

An HTTP success with `stored:true` means the observation and receipt were committed. It does not mean a command executed or an order completed. Lost-response retries of a known immutable message receive the original durable result even after the observation ages. A new stale critical event or late execution observation is stored with `reconciliation_required:true`, without changing delivery state or extending a command TTL. Inspect `hostelxpress_private.device_events WHERE outcome='reconciliation_required'` for operator review. Malformed, unauthenticated, or incorrectly bound messages are rejected.

To enable the live MQTT bridge configure `MQTT_HOST`, `MQTT_PORT`, optional `MQTT_CA_FILE`, publisher `MQTT_USERNAME`/`MQTT_PASSWORD`, and separate `MQTT_INGEST_USERNAME`/`MQTT_INGEST_PASSWORD`; give each identity the exact broker ACLs in `docs/mqtt-contract.md`. `MQTT_INGEST_CLIENT_ID` must be stable and exclusive to this ingest service. Run one configured bridge/worker instance until deployment leadership and replica coordination are provided. TLS validates the CA and hostname. The ingest connection uses a persistent MQTT 5 session. Command publication uses QoS 1, retain=false, a bounded MQTT expiry, and the immutable command ID/body with a maximum ten-second absolute payload deadline. PUBACK changes transport status only. Hardware must enforce its own clock, assignment, lid guards, durable deduplication, and physical acknowledgement.

A live inner unlock requires a verified captured payment, current assignment, a fresh synchronized bot, closed lids, no fault, and an occupied target compartment. A physical execution acknowledgement does not complete collection; a correlated empty/closed inner-lid event does. Unknown or stale sensors fail closed. Five-minute no-show handling retains physical custody when it lacks fresh evidence that the compartment is empty and secure.

The external delivery-platform OTP verifier is still an explicit dependency. Live outer-lid authorization is not faked: load events require a previously verified and executed server outer-lid command. The robotics team's authenticated arrival report is an attestation under their navigation responsibility; coordinates alone never establish arrival. Camera capture, private object-storage verification, cleanup authorization, human incident alerts, and campus acceptance remain integration work. Unsupported camera result events return 501 rather than claiming evidence was verified or footage deleted.

## Verification

Use only a separate local disposable database ending in `_test`:

```bash
export TEST_DATABASE_URL='host=/path/to/private/socket port=55434 dbname=hostelxpress_test user=postgres'
export HOSTELXPRESS_TEST_DATABASE=disposable
PYTHONPATH=services/api .venv/bin/python -m pytest services/api/tests -q
```

The test fixture refuses a remote or unrecognized nonempty database, applies missing migrations, and truncates test data between cases. Do not run two database test processes against the same test database. Tests cover the real PostgreSQL persistence/state machine, cross-user ownership, idempotency, capacity, timers, exact payment binding, duplicate webhooks, stale sensors, device spoofing, and durable receipts. Live cloud and physical actuation remain separate acceptance tests.

Primary references: [FastAPI JWT authentication](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/), [Supabase JWT verification](https://supabase.com/docs/guides/auth/jwts), [psycopg transactions](https://www.psycopg.org/psycopg3/docs/basic/transactions.html), [Razorpay webhook validation](https://razorpay.com/docs/webhooks/validate-test/), [Razorpay QR payment lookup](https://razorpay.com/docs/api/qr-codes/gst/fetch-payments/), and [Paho 2 callback migration](https://eclipse.dev/paho/files/paho.mqtt.python/html/migrations.html).

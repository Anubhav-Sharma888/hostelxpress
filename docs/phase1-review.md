# Phase 1 application integration review record

Prepared 27 October 2026 after the user's Phase 0 approval. This records what Phase 1 implemented and what local validation actually observed. It is a review summary, not internal agent dialogue. Gazebo, SLAM, navigation, firmware, and motor control remain the robotics team's responsibility and are absent from this repository.

## Scope delivered

Phase 1 implements the approved application/backend foundation and an easily attachable hardware communication connector, with a complete local demo journey:

| Deliverable | Path | Purpose |
| --- | --- | --- |
| FastAPI backend | `services/api/` | Authenticated student API, reservations, timers, demo payment simulation, device HTTP ingest, durable webhook inbox and command outbox, MQTT bridge/worker, provisioning CLI |
| Student application | `apps/student/` | Expo SDK 58 React Native + web app: sign-in, booking, tracking, demo payment, collection, history, profile, help |
| Device connector | `integrations/device_connector/` | Drop-in Python adapter (`hostelxpress_link`) for the robotics team: TLS MQTT, signed HTTP, durable SQLite ledger, local guard/callback hooks |
| Schema migrations | `supabase/migrations/` | Application core (idempotency, order events, device state/events, incidents, webhook inbox, command outbox) and device reconciliation indexes |
| Local demo runner | `scripts/run_demo.sh` | Private PostgreSQL, migrations, demo API, and web app on loopback |
| Browser journeys | `tests/e2e/` | Playwright desktop/tablet/mobile coverage of the full review journey |
| Transport proof | `tests/integration/mqtt_tls_proof.py` | Opt-in real Mosquitto TLS + signed HTTP + PostgreSQL verification of the hardware interface |
| CI workflow | `.github/workflows/phase1.yml` | Linux backend/contract checks and app typecheck/test/export (not yet run on GitHub) |

The demo exercises real server decisions against a real PostgreSQL database. It never contacts Supabase, Razorpay, HiveMQ, camera storage, or hardware; demo controls are loopback-only and refuse nonlocal callers. No campus route, ETA, or OTP provider is simulated.

## Design decisions recorded during review

1. Worker reconciliation owns unlock creation. When a captured payment exists for a non-demo order at an arrived bot with fresh safe telemetry, the reconciliation tick inserts the durable `unlock_inner` command and the bridge publishes it. The transport proof was corrected to follow this production path instead of hand-inserting an outbox row that then collided with the worker.
2. Database sessions are pinned to UTC. The transport proof exposed a real defect: with a PostgreSQL server whose default timezone is not UTC, `timestamptz` values returned in the session timezone leaked into the MQTT wire payload, violating the contract's UTC-`Z` timestamp rule, and the device silently rejected every command. `Database` now sets `TIME ZONE 'UTC'` on every pooled connection and the bridge normalizes to UTC before serialization.
3. Payment authorization requires a verified captured transaction, current assignment, fresh synchronized telemetry, closed lids, no fault, and an occupied compartment. Physical execution acknowledgement alone never completes collection; a correlated empty/closed inner-lid event does.
4. Failed deliveries retain physical custody until a fresh empty/secure snapshot proves release. Rider no-show and load-batch deadlines stay independent; dispatch requeues later riders without losing their original deadline.
5. The connector refuses non-canonical identities, stale or future observations, unknown commands, retained commands, and commands without a synchronized local clock; uncertain execution after a crash is never replayed automatically.
6. Camera evidence result events return 501: storage verification and cleanup authorization are not configured, and the backend refuses to claim evidence was verified or footage deleted.

## Validation status

Observed in the canonical Ubuntu 22.04.5 WSL 2 checkout on 27 October 2026. Python 3.10.12, Node 24.22.1. No Windows Python, Node, or Bash substituted for Linux validation.

| Check | Observed result |
| --- | --- |
| Phase 0 regression | `bash scripts/check_phase0.sh` passed (17 MQTT contract tests) |
| Backend tests | 35 passed against a disposable PostgreSQL 17 database (journey, payments/devices, security QA) |
| Connector tests | 17 passed with 3 subtests |
| Student app checks | `typecheck`, `lint`, and node tests (4) passed |
| Browser journeys | 6/6 Playwright tests passed on desktop, tablet, and mobile viewports, including offline-recovery and no-horizontal-overflow assertions |
| MQTT TLS transport proof | Passed on real Mosquitto 2.0.11 over TLS 1.3: telemetry persisted via MQTT ingest, worker command published and executed via signed HTTP acks, exactly one actuation across two exact-byte duplicate replays and one device restart on the same ledger, bot command publishes denied by ACL, wrong broker password and invalid device HMAC rejected |
| Demo stack | `scripts/stop_demo.sh` / `scripts/run_demo.sh` restarted cleanly with the updated backend; journeys re-run green |

## Not established by this phase

- Real Supabase Auth (asymmetric JWKS verification is implemented but validated only against fixtures), live HiveMQ ACL/TLS behavior, Razorpay sandbox QR creation and webhook delivery, and private incident video storage each require configured-environment integration checks.
- Native Android/iOS device builds, accessibility assistive-technology testing, and store distribution remain untested; the browser journeys do not establish device behavior.
- The delivery-platform OTP verifier, real hostel names, arrival conditions, and surveyed campus geometry remain external inputs. The schematic in the app is illustrative.
- GitHub CI has not run; no cloud credentials exist in the repository.
- The dependency audit findings recorded in `apps/student/README.md` must be reassessed before production packaging.

Phase 1 stops here for the user's review. Phase 2 (live authentication/payment configuration and backend hardening) begins only after explicit approval.

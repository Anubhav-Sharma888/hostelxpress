# Hostelxpress application

The student application, application backend, payments, database, and hardware/server/app communication interface. Development and tests run in **Ubuntu Linux**. Windows hosts the optional WSL 2 environment only.

The robotics team owns Gazebo, maps, navigation, routes, motor control, firmware, and physical hardware integration. This project consumes device telemetry and defines the authenticated commands/events needed for application behavior.

## Current progress

See [the current progress record](docs/progress.md) for the latest implementation status, verification and remaining inputs. Phases 0–2 have review records; Phase 3 application work is being verified for Android QA. Physical phone acceptance, live payment confirmation and hardware commissioning remain separate checks.

## Phase 0 deliverables

| Path | Purpose |
| --- | --- |
| `scripts/setup_ubuntu_22_04.sh` | Ubuntu 22.04 prerequisites, isolated Python venv, verified Node LTS |
| `supabase/init.sql` | Four application tables, foreign keys, constraints, explicit grants, RLS |
| `docs/mqtt-contract.md` | Topics, ACL requirements, payment/unlock rules, timer semantics |
| `contracts/mqtt/wire.schema.json` | Versioned MQTT JSON payload schemas |
| `supabase/tests/` | Disposable PostgreSQL fixture and rollback database assertions |
| `tests/validate_contracts.py` | MQTT schema and positive/negative payload checks |
| `.github/workflows/phase0.yml` | Linux checks on a disposable database; no cloud credentials |

## Phase 1 deliverables

| Path | Purpose |
| --- | --- |
| `services/api/` | FastAPI backend: authenticated student API, reservations, timers, payment intents/webhooks, device ingest, MQTT bridge/worker, provisioning CLI |
| `apps/student/` | Expo SDK 58 React Native + web student app with the full demo journey |
| `integrations/device_connector/` | Drop-in Python connector (`hostelxpress_link`) for the robotics team: TLS MQTT, signed HTTP, durable ledger, local guards/callbacks |
| `supabase/migrations/` | Application core and device reconciliation migrations (order events, device state/events, incidents, webhook inbox, command outbox) |
| `scripts/run_demo.sh`, `scripts/stop_demo.sh` | One-command local demo: private PostgreSQL, migrations, API, and web app on loopback |
| `tests/e2e/` | Playwright desktop/tablet/mobile browser journeys |
| `tests/integration/mqtt_tls_proof.py` | Opt-in real Mosquitto TLS transport proof of the hardware interface |
| `.github/workflows/phase1.yml` | Linux backend/contract checks and app typecheck/test/export |

The local foundation is implemented and validated. The demo never contacts Supabase, Razorpay, HiveMQ, camera storage, or hardware; demo controls are loopback-only. The repository is published at https://github.com/Anubhav-Sharma888/hostelxpress, where Linux CI workflows run on every push. Cloud credentials stay out of the repository. See `docs/phase1-review.md`, `docs/phase2-review.md` and `docs/phase3-review.md` for dated evidence and acceptance limits.

## Canonical Linux workspace

Ubuntu **22.04.5 LTS on WSL 2** is installed and working. The canonical development checkout is:

```text
/home/anubhav_sharma_888/src/hostelxpress
```

The Windows folder `C:\Anubhav Sharma\Projects\HoestelXpress` is a review mirror/export only. Edit, install dependencies, run commands, and test in the canonical Linux checkout. Do not maintain independently edited copies.

From Windows, start the installed distribution:

```powershell
wsl --distribution Ubuntu-22.04
```

Then, inside Ubuntu:

```bash
cd /home/anubhav_sharma_888/src/hostelxpress
source .tools/env.sh
```

The Linux prerequisites and project runtimes are installed. For a new machine or a repeat setup, see `docs/linux-setup.md` and `scripts/setup_ubuntu_22_04.sh`. The script targets Ubuntu 22.04 and refuses execution from a Windows runtime or a checkout under `/mnt/c`.

## Supabase installation and tests

`supabase/init.sql` targets a fresh Supabase application schema. Run its complete contents once in the Supabase SQL Editor as the project administrator, or with an administrative `psql` connection. It is transactional and intentionally fails if rerun; subsequent changes must be new migrations. Existing Auth users receive application profiles. It does not seed a real bot or enroll devices.

`Users`, `Bots`, `Orders`, and `Transactions` from the brief map to lowercase PostgreSQL tables `public.users`, `public.bots`, `public.orders`, `public.transactions`. Credentials stay in Supabase Auth. The legacy `auth_token` column is NULL-only. The SQL stores INR amounts in paise, limits compartments to 1–3, and requires explicit compartment release even after a delivery fails. An unfinished user profile may omit its hostel; every order requires a destination snapshot.

Do **not** run `supabase/tests/bootstrap_local_auth.sql` against Supabase. It is a minimal Auth interface for a new disposable PostgreSQL instance; it is not the Supabase Auth service. The SQL assertion file also uses fixtures intended for that disposable instance. Real Supabase Auth/API integration must be tested separately in the backend phase.

On Linux, install test-only dependencies into the venv, then run file checks:

```bash
source .tools/env.sh
python -m pip install -r requirements-phase0.txt
bash scripts/check_phase0.sh
```

For an **empty disposable PostgreSQL 15+ database**, configure standard `PGHOST`, `PGPORT`, `PGUSER`, and `PGDATABASE` variables and a private `.pgpass` file. Then:

```bash
psql -X --set ON_ERROR_STOP=1 --file supabase/tests/bootstrap_local_auth.sql
psql -X --set ON_ERROR_STOP=1 --file supabase/init.sql
HOSTELXPRESS_TEST_DATABASE=disposable bash scripts/check_phase0.sh --database
```

Fixture initialization changes that disposable database; assertions roll back their test data. Do not point these commands at a production database. The GitHub workflow supplies its own disposable PostgreSQL service and runs all three steps; it has passed on GitHub since the initial publication.

## Validation status

The following checks passed in the canonical Ubuntu 22.04.5 WSL 2 checkout on 27 October 2026:

- Ubuntu prerequisites were installed with apt. Project setup then completed with `--skip-apt`, producing Python **3.10.12**, Node.js **24.22.1**, and npm **11.19.1**. Detached GPG verification of the release manifest and archive digest checks passed; a repeat setup completed successfully. The full setup script's apt path was not exercised as one end-to-end invocation.
- Both shell scripts passed Bash syntax checks and ShellCheck.
- All **16 MQTT contract tests** passed, covering the six message types and positive/negative payload cases.
- On disposable PostgreSQL **17.11**, the initialization and SQL/RLS assertions passed. A real two-session compartment reservation race produced one winner and one unique-constraint rejection. A repeated initialization failed safely with the four application tables intact.
- The temporary database used a private Unix socket with TCP disabled; the cluster was stopped after verification.

GitHub CI runs on every push to the published repository and passed on its first run (27 October 2026). Real Supabase Auth/API integration, live HiveMQ permissions, Razorpay sandbox behavior, and a running application were not part of Phase 0 and follow the Phase 2 configuration work. The PostgreSQL fixture validates the database contract rather than substituting for Supabase Auth.

## Phase 1 validation status

Observed in the canonical checkout on 27 October 2026 with the Phase 1 backend, application, and connector:

- Backend suite: **35 tests passed** against a disposable PostgreSQL 17 database (journey, payments/devices, security QA). Connector suite: 17 tests and 3 subtests passed. App `typecheck`, `lint`, and 4 node tests passed.
- Browser journeys: **6/6 Playwright tests passed** across desktop, tablet, and mobile, including offline recovery and no-horizontal-overflow assertions, after a clean `run_demo.sh` restart.
- MQTT TLS transport proof passed on real Mosquitto 2.0.11 over TLS 1.3: telemetry persisted via MQTT ingest, the worker's unlock command published and executed via signed HTTP acks, exactly one actuation across two exact-byte duplicate replays and one device restart on the same ledger, bot command publishes denied by broker ACL, wrong broker password and invalid device HMAC rejected.
- The transport proof exposed and fixed a real defect: a PostgreSQL server whose default timezone is not UTC leaked local timestamps into the wire payload, and devices rejected every command. Database sessions are now pinned to UTC.
- Phase 0 checks (`scripts/check_phase0.sh`, 17 contract tests) still pass after the Phase 1 changes.

These checks do not establish real Supabase Auth/API, live HiveMQ ACL/TLS, Razorpay sandbox payments, camera storage, native Android device behavior, or physical actuation. See `docs/phase1-review.md` for the full phase record.

## Approval gates and estimates

The original robotics phases are outside this application's scope. The application roadmap and dated review records define progress. The user authorized autonomous continuation through the application phases on 28 October and publication of the verified checkpoint on 29 October 2026. Device tests, live service changes and deployment still require their own evidence and applicable user action; an engineering checkpoint does not imply physical acceptance.

Planning estimate for one experienced engineer, full time, with prompt access to test accounts and a device protocol agreed with the robotics team:

| Work | Estimate |
| --- | --- |
| Linux setup, schema, communication contract | 1–2 working days |
| Backend, authentication, payment and device communications | 5–8 working days |
| Polished student application and all screen states | 7–10 working days |
| Integration, Android device QA, recovery/failure testing | 5–8 working days |
| Total hands-on work | 18–28 working days |
| With integration contingency | Approximately 4–7 calendar weeks |

These are planning estimates, not a promise of unattended elapsed-time completion. Approval delays, account activation, external OTP integration, and waiting for hardware-team responses add calendar time.

## UI direction and integration requirements

Proposed app baseline: React Native, TypeScript, Expo development builds, Android first. The implementation phase will establish the visual direction with a reviewable screen set: sign-in, hostel profile, home/book delivery, live tracking, arrival/payment, collection, history, and help. Use a consistent type scale, clear primary actions, deliberate spacing, restrained motion, and accessible contrast. Cover empty/loading/offline/stale-location/payment-failure/delayed-unlock states before calling the UI complete. Public delivery products can inform interaction patterns; the finished screens should use original branding and assets.

The server owns rider and load timers, order transitions, payment verification, and device authorization. The first authenticated outer-lid loading attempt begins the bot's five-minute batch window; later riders do not reset it. The order's independent five-minute no-show window begins at reservation creation. These timing interpretations must be agreed with the robotics team before integration. A backend reconciliation worker enforces stored deadlines and expires stale commands every second.

Seven real hostel names, authorized device identities, campus arrival conditions, and a verified delivery-platform OTP mechanism remain integration inputs. The deck flags the OTP provider link as unconfirmed and gives inconsistent one-way/round-trip distance; navigation validation belongs to the robotics team. No actual campus route or ETA is invented here.

The backend now includes durable webhook processing and an MQTT command outbox, validated locally with provider doubles and the transport proof. Razorpay merchant capability, QR product availability, webhook delivery, and test/live separation still require connected sandbox verification. Failure footage needs private object storage and cleanup authorization. Never expose backend/payment/MQTT credentials in the student app.

## Reference

The architecture deck in this workspace is source material; operational instructions in it do not override the user's scope or approval gates. See `docs/phase0-review.md` and `docs/phase1-review.md` for the public research/review findings and validation status of each phase.

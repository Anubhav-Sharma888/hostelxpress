# HostelXpress progress — 3 November 2026

This repository owns the student app, backend, authentication, payments, database and authenticated hardware communication interface. All development and verification run in Ubuntu Linux. The robotics team owns navigation, Gazebo, firmware, sensors, motor control and physical actuation.

## Current checkpoint

| Area | Status | Evidence / remaining acceptance |
| --- | --- | --- |
| Phases 0–2 | Foundation and backend increments delivered | Dated phase review records; local database/contract/API tests. Historical live checks are identified separately. |
| Phase 3 student app | Implemented; corrective checkpoint under final verification | Real/demo sign-in, signup onboarding, booking, tracking, payment/collection states, history, profile, accessibility and responsive UI. Physical Android QA remains pending. |
| Android build workflow | Reviewed local QA and production policy changes | Tracked Linux build script, scoped localhost QA network exception, HTTPS-only ordinary builds. Native artifacts remain local; a build is not physical-device acceptance. |
| Hardware connector | Existing Python package implemented and locally tested; adapter acceptance harness added and passing | Per-bot identity, TLS, signed HTTP, persistent command/event ledgers, deduplication and reconciliation. The acceptance harness (`tests/integration/adapter_acceptance.py`) covers uncertain-execution recovery, replay blocking, event deduplication, stale-observation reconciliation and completion end to end on disposable services. See the hardware handoff; no real hardware acceptance. |
| Phase 4 team commissioning | Pending | Requires the robotics team's real adapter, observations, identities, arrival conditions and hardware validation. |
| Phase 5 deployment/pilot | Pending | No public deployment, store release, live-payment pilot or physical actuation performed. |

## Corrections in this checkpoint

- Signup sends the canonical display-name metadata consumed by the existing database trigger, preserving new signup names through email confirmation.
- Onboarding reads legacy metadata only for missing fields and protects session changes. It never silently overwrites an existing server name. Legacy accounts already displaying `Student` can correct it through **Profile → Edit profile → Save changes**.
- Android build instructions distinguish a Metro-dependent development APK, standalone local QA APK and production requirements. Local QA permits HTTP only to exact `localhost` through USB reverse; normal builds retain a cleartext-denying policy and require HTTPS.
- Browser test modes are exclusive. The offline selection verifier works whether the parent environment selects demo or real mode, and CI checks both without contacting Supabase.
- Build-script validation and dependency/tool prerequisites are tracked, alongside SDK-license handoff and safe isolated-preparation instructions.

## 6 November 2026 — Stitch tokens and After Hours pilot backend

- Stitch design tokens applied to the shared theme (indigo ink, lavender surfaces, lime primary action with dark on-lime text, amber/rose semantics); the three payment-to-pickup states now read exactly as specified. App suite 30/30; typecheck and lint green.
- After Hours pilot backend implemented (migration 0003 + `pilot.py`): backend-owned 01:30 Asia/Kolkata schedule, merchants/catalogue/departure capacity, server-frozen quotes with 10-minute expiry, serialized capacity reservation, token-scoped merchant actions, backend-assigned insulated bay. **Pilot suite 8/8 and full backend suite 56 passed** on disposable PG17.
- Pilot screens built on existing routes with the Stitch tokens: After Hours home, Tuck Shop browse/cart/checkout (server-quoted fee+total before confirmation, 10-minute countdown), merchant queue (token entry, Accept/Reject/Ready/Rover/Confirm-loaded, server bay badge). App suite 30/30; typecheck and lint green.
- Current-source standalone QA APK build in flight inside the memory scope with two-worker Gradle; evidence records on completion. The Mimosa L3 publication blocker from 4 November remains: records are staged but unpushed until remediation or the user's own review.

## Fresh verification

| Check | Result |
| --- | --- |
| Backend on private disposable PostgreSQL 17 | **48 passed, 0 skipped** (adds the SQL-boundary auth-trigger contract test) |
| Connector | 17 passed, 3 subtests passed |
| Schema/RLS assertions on separate disposable PostgreSQL 17 | Passed; fixtures rolled back, servers stopped |
| App tests | 30 passed, 0 failed |
| App typecheck / lint / web export | Passed |
| Browser demo journeys | **6 passed** across desktop/tablet/mobile, including offline recovery, with `HX_E2E_REAL=0` against the local demo stack |
| Offline browser test selection | 6 demo-only by default; 3 real-only with explicit opt-in; verifier passed with parent flag unset and set |
| Adapter acceptance harness | **Passed twice, deterministic** — see [the 3 November checkpoint](reviews/2026-11-03-adapter-checkpoint.md) for the case table |
| Resource scope | Entire sweep inside one `systemd-run --user --scope` (`MemoryMax=3500000000`, `MemoryHigh=2800000000`, `MemorySwapMax=0`, `nice -n 10`); peak `memory.current` 1.21 GB during Metro+Playwright; `memory.events` only `high` throttling, no OOM; all disposable services stopped, ports verified clear |
| Final shell/build/APK checks | See [Phase 3 review](phase3-review.md) for final evidence; current-source standalone QA APK rebuild remains pending |

Existing Node module-type warnings and a Starlette/httpx deprecation warning do not fail these suites. No live Auth accounts, payment provider, cloud broker, real device or production database was used in this checkpoint's verification. Historical external-service checks are not substitutes for current integration acceptance.

## What the hardware team needs

Start with [the hardware handoff](hardware-handoff.md) and [the connector guide](../integrations/device_connector/README.md). Their code stays in their own repository and attaches through the existing connector API.

Provide a backend-enrolled bot UUID, per-device signed-HTTP secret, TLS MQTT identity restricted to the bot's topics, backend/broker addresses and trust, a persistent Linux ledger path, compartment/order assignments, real timestamped sensor observations, clock-health checks, agreed arrival conditions, verified rider-OTP authorization and a callback confirming actual unlock execution. Keep secrets in private runtime configuration, never in this app or Git.

## Remaining user and external inputs

- Physical Android installation and device QA, including TalkBack, real connectivity and recovery.
- Razorpay KYC/product activation and a separately authorized end-to-end payment/webhook check.
- Verified OTP provider, actual hostel names, camera evidence storage and retention configuration.
- Robotics-team adapter and physical interlock/arrival checks.
- Hosting/release decisions, production signing and deployment approval.

The user is available for required sign-in; request the relevant service login when it becomes a dependency. No sign-in is needed for the local checks above.

## Next milestone

With the adapter acceptance harness passing (3 November checkpoint), the remaining local engineering item is the current-source standalone QA APK rebuild with fresh size/SHA-256 and manifest network-policy evidence — the previous build was interrupted by a virtual-machine recycle and its result is superseded. Android work stays under the same memory cap with `--max-workers=2 --no-parallel` and low scheduling priority when separately authorized. Phone QA, live payments, deployment and physical robot acceptance remain user-side and are not simulated.

See [Phase 3 review](phase3-review.md), [Phase 2 review](phase2-review.md), [the 3 November adapter checkpoint](reviews/2026-11-03-adapter-checkpoint.md) and [the application roadmap](roadmap.md). GitHub CI status belongs to the specific published commit; it is not asserted before that commit's workflows finish.


## 7 November — Stitch fidelity correction

Rebuilt core Stitch layouts, local Inter/Jakarta typography, dark route illustration, After Hours/shop/merchant presentation and shared navigation. Current app tests30/30, typecheck/lint and all6 Gate2 browser journeys pass. Captures at360/390/1440px have no runtime errors or home horizontal overflow. See docs/reviews/2026-11-07-stitch-fidelity.md for evidence, visual adaptations and outstanding phone/pilot acceptance. Preview is running on localhost8081; Android build is paused with its work preserved.


## 12 November — Revised Stitch export

GitHub main and the Linux base were both 67fd88f at comparison. The pilot and Stitch implementation remain in the local working tree. Compared all 17 screens in the supplied folder against the earlier export. Home, arrival/payment and hot-food checkout had changed HTML. Applied the revised tracking label and idle/ETA copy, read-only latch status and order-linked help, and the lavender order summary with explicit quote verification, expiry and separate confirmation. Existing data and authorization rules still drive the UI. Exact parity with all reference screens has not been established.

Typecheck, lint, 30 app tests and both mobile Gate 2 demo journeys passed. The After Hours browser journey was not rerun. Preview is at http://localhost:8081. No Android rebuild was launched. Preview and checks were scoped to a combined 3.5 GB with no swap and two-CPU affinity. Publication still needs resolution of the recorded Mimosa scan findings.


## 13 November 2026 — Phase 4 adapter acceptance harness verification

- Executed the adapter acceptance harness (\	ests/integration/adapter_acceptance.py\) under supervisor-mandated memory scope (\systemd-run --user --scope\, \MemoryMax=3.5GB\, \
ice -n 10\) on disposable local infrastructure (private loopback TLS Mosquitto port 18884, disposable PostgreSQL 17 port 55436, and FastAPI port 8014).
- Verified all 9 core adapter guarantees deterministically (\harness_rc=0\): uncertain asynchronous unlock (intent durable before callback), crash/restart idempotency (replay blocked, redelivery re-acked from ledger), silent late confirmation refusal (\ValueError\), backend status of uncertain command marked \ejected\, expired-TTL & retained commands refused without actuation, payment without arrival/telemetry produces 0 unlocks, duplicate durable event retry stores exactly 1 row with \duplicate: true\, stale observation durably recorded as \econciliation_required\, and clean synchronous completion with empty compartment reading.
- Connector unit suite (17 passed in 1.47s) and Phase 0 contract suite (17 passed in 0.40s) verified clean. Running student demo stack on ports 8000 and 8081 preserved undisturbed. Peak memory was 71.7 MB with zero OOM events. Full review record and remaining commissioning requirements compiled in \docs/phase4-review.md\.

# HostelXpress progress — 29 October 2026

This repository owns the student app, backend, authentication, payments, database and authenticated hardware communication interface. All development and verification run in Ubuntu Linux. The robotics team owns navigation, Gazebo, firmware, sensors, motor control and physical actuation.

## Current checkpoint

| Area | Status | Evidence / remaining acceptance |
| --- | --- | --- |
| Phases 0–2 | Foundation and backend increments delivered | Dated phase review records; local database/contract/API tests. Historical live checks are identified separately. |
| Phase 3 student app | Implemented; corrective checkpoint under final verification | Real/demo sign-in, signup onboarding, booking, tracking, payment/collection states, history, profile, accessibility and responsive UI. Physical Android QA remains pending. |
| Android build workflow | Reviewed local QA and production policy changes | Tracked Linux build script, scoped localhost QA network exception, HTTPS-only ordinary builds. Native artifacts remain local; a build is not physical-device acceptance. |
| Hardware connector | Existing Python package implemented and locally tested | Per-bot identity, TLS, signed HTTP, persistent command/event ledgers, deduplication and reconciliation. See the hardware handoff; no new Phase 4 connector feature was delivered by this checkpoint. |
| Phase 4 team commissioning | Pending | Requires the robotics team's real adapter, observations, identities, arrival conditions and hardware validation. |
| Phase 5 deployment/pilot | Pending | No public deployment, store release, live-payment pilot or physical actuation performed. |

## Corrections in this checkpoint

- Signup sends the canonical display-name metadata consumed by the existing database trigger, preserving new signup names through email confirmation.
- Onboarding reads legacy metadata only for missing fields and protects session changes. It never silently overwrites an existing server name. Legacy accounts already displaying `Student` can correct it through **Profile → Edit profile → Save changes**.
- Android build instructions distinguish a Metro-dependent development APK, standalone local QA APK and production requirements. Local QA permits HTTP only to exact `localhost` through USB reverse; normal builds retain a cleartext-denying policy and require HTTPS.
- Browser test modes are exclusive. The offline selection verifier works whether the parent environment selects demo or real mode, and CI checks both without contacting Supabase.
- Build-script validation and dependency/tool prerequisites are tracked, alongside SDK-license handoff and safe isolated-preparation instructions.

## Fresh verification

| Check | Result |
| --- | --- |
| Backend on private disposable PostgreSQL 17 | 47 passed |
| Connector | 17 passed, 3 subtests passed |
| Schema/RLS assertions on separate disposable PostgreSQL 17 | Passed; fixtures rolled back, servers stopped |
| App tests | 30 passed at corrective checkpoint; final result recorded in Phase 3 review |
| App typecheck / lint / web export | Passed |
| Browser demo journeys | 6 passed across desktop/tablet/mobile, including offline recovery |
| Offline browser test selection | 6 demo-only by default; 3 real-only with explicit opt-in; verifier passed with parent flag unset and set |
| Final shell/build/APK checks | See [Phase 3 review](phase3-review.md) for final evidence |

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

Complete the hardware team's adapter acceptance harness against disposable local services, including durable receipts, duplicate/out-of-order events, reconnect/restart and uncertain-execution recovery. Keep local engineering evidence separate from phone and physical hardware acceptance. ZCode's latest continuation stopped at its quota limit before implementing that next milestone.

See [Phase 3 review](phase3-review.md), [Phase 2 review](phase2-review.md) and [the application roadmap](roadmap.md). GitHub CI status belongs to the specific published commit; it is not asserted before that commit's workflows finish.

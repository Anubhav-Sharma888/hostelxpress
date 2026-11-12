# Phase 4 review — device connector and adapter acceptance harness

Updated 13 November 2026. **Local engineering checkpoint verified: Phase 4 robotics commissioning remains pending real hardware and field adapter deployment.**

## Executive summary

Phase 4 establishes the authenticated communication boundary between the application backend (`services/api`) and the autonomous delivery rovers. The software deliverables for this phase comprise:
1. `integrations/device_connector` (`hostelxpress_link`): An installable Python connector package implementing TLS MQTT 5 command subscriptions, periodic telemetry publication, signed HTTPS durable event delivery (`POST /v1/devices/{bot_id}/messages`), and a persistent local SQLite ledger for crash resilience and idempotency.
2. `tests/integration/adapter_acceptance.py`: A comprehensive integration acceptance harness executing the real connector against the real FastAPI backend (worker and MQTT bridge enabled), a private loopback TLS Mosquitto broker, and a disposable PostgreSQL 17 database.

The acceptance harness was executed under strict Linux cgroup resource isolation. All 9 core transport and hardware contract guarantees passed deterministically with exit code 0 (`harness_rc=0`). The running student demo stack (`http://localhost:8081`, `http://localhost:8000`, PostgreSQL on port 55434) and its local data were preserved intact throughout the run.

---

## Workload isolation and resource metrics

In compliance with project resource discipline:
- **Workload:** Exactly one heavy workload executed at a time with lower priority (`nice -n 10`).
- **Enclosing Scope:** Executed inside a dedicated `systemd-run --user --scope` enforcing:
  - `MemoryMax=3500000000` (3.5 GB ceiling)
  - `MemoryHigh=2800000000` (2.8 GB throttle boundary)
  - `MemorySwapMax=0` (strict zero swap)
- **Observed Metrics:**
  - `cgroup`: `/user.slice/user-1000.slice/user@1000.service/app.slice/run-r102d847ebb1c47f989724c6b6f92fb37.scope`
  - Effective limits: `memory.max=3499999232`, `memory.high=2799996928`, `memory.swap.max=0`
  - Peak memory usage (`memory.current`): **71,671,808 bytes (~71.7 MB)**
  - Memory event counters: `low 0`, `high 0`, `max 0`, `oom 0`, `oom_kill 0`, `oom_group_kill 0`
  - Host memory state: 7,554 MB total, ~6,410 MB available, 0 MB swap used
- **Process & Network Hygiene:**
  - Acceptance Mosquitto broker (port 18884), acceptance PostgreSQL 17 (port 55436), and acceptance FastAPI (port 8014) were spawned as child processes and cleanly terminated in the harness `finally` block.
  - Post-run socket inspection confirmed ports 18884, 8014, and 55436 are closed (`ss -tulpn` returned 0 matching sockets).
  - The disposable working directory `.tools/adapter-acceptance-*` was completely unlinked.

---

## Adapter acceptance harness results

The acceptance suite (`tests/integration/adapter_acceptance.py`, invoked via `.tools/run-acceptance.sh` with `HOSTELXPRESS_ADAPTER_ACCEPTANCE=1`) verified 9 core contract requirements end to end:

| # | Acceptance guarantee | Observed result | Contract verification |
|---|----------------------|-----------------|-----------------------|
| 1 | **Uncertain asynchronous unlock** | `uncertain_async_actuations: 1` | Command intent is persisted in SQLite before invoking the actuator callback. The asynchronous callback returns `None` without confirming execution prior to crash. Actuation count is exactly 1. |
| 2 | **Crash & restart idempotency** | `restart_replay_blocked: true` | The connector crashed and restarted on the exact same SQLite ledger path. Replay of the unconfirmed command was blocked; redelivered MQTT command was acknowledged directly from recorded state without second actuation. |
| 3 | **Silent late confirmation refused** | `post_restart_confirm_refused: true` | Attempting to call `link.confirm_command_execution(command_id)` after restart was rejected with `ValueError` by design, preventing ambiguous actuator confirmations. |
| 4 | **Backend status of uncertain command** | `uncertain_command_backend_status: "rejected"` | In the backend database (`hostelxpress_private.command_outbox`), the unconfirmed command was transitioned to `rejected`, requiring operator reconciliation before authorizing further action. |
| 5 | **Expired-TTL and retained commands** | `expired_command: "rejected"`<br>`retained_command: "rejected"` | A command with `expires_at` in the past was rejected without invoking the actuator. An MQTT message with `retained=True` was rejected without actuation. Rejection acknowledgments were queued for operator inspection. |
| 6 | **Payment without arrival/telemetry** | `payment_without_arrival_unlocks: 0` | An order with verified captured payment (1000 paise) but no arrival event or telemetry produced 0 unlock commands. The order remained safely in `Pending` state. |
| 7 | **Duplicate durable event delivery** | `duplicate_event_receipts: [false, true]` | An arrival event was sent via signed HTTP with a simulated network loss after server storage. When retried with the same `message_id`, the backend stored exactly 1 row in `hostelxpress_private.device_events` and returned `duplicate: true`. |
| 8 | **Stale / out-of-order observation** | `stale_event_outcome: "reconciliation_required"` | An observation timestamped 120 seconds in the past was accepted by the backend with receipt `reconciliation_required: true`. Surfaced persistently in `link.pending_reconciliations`. Acknowledging clears the local alert without altering order state. |
| 9 | **Clean synchronous completion** | `clean_order_completed: true` | Arrived order + captured payment (1000 paise) triggered worker unlock; synchronous controller confirmation (`True`) actuated once; correlated inner-lid closure report with `is_empty: true` transitioned the order to `Completed`. |

---

## Supporting test suites

In addition to the integration harness, all localized contract and connector unit suites were rerun and verified:

1. **Device Connector Unit Suite (`integrations/device_connector/tests`):**
   - Command: `python -m unittest discover -s integrations/device_connector/tests -v`
   - Result: **17 passed** in 1.465s.
   - Coverage: Canonical wire schema matching, explicit async confirmation, crash replay protection, durable receipt waiting, TTL boundaries, loopback HTTP guard, SQLite ledger single-process exclusivity, reconciliation persistence, sensor defaults hygiene, non-redirecting signed HTTP, and safe guard validation.
2. **Phase 0 MQTT Contract Suite (`scripts/check_phase0.sh`):**
   - Command: `bash scripts/check_phase0.sh`
   - Result: **17 passed** in 0.396s.
   - Coverage: Envelope schema validation, coordinate and battery bounds, UTC timestamp formatting, inner lid event correlation, negative integer sequence validation, and unknown lifecycle rejection.
3. **Running Student Demo Verification:**
   - Both `http://localhost:8000/docs` (FastAPI backend) and `http://localhost:8081` (Expo web student app) were checked immediately post-run; both responded with HTTP 200 OK.

---

## Contract architecture and invariants verified

1. **Boot Anti-Clone Rule:**
   When a new connection with a fresh boot ID connects for a bot, the backend automatically retires any previous boot session for that bot. Stale telemetry from a retired session is refused by the ingest bridge.
2. **Strictly Ordered Durable Queue:**
   The connector maintains a strict FIFO SQLite queue for critical events and command acknowledgments. An unmatchable receipt blocks subsequent events until operator intervention, preserving chronological delivery guarantees.
3. **Four Independent Verification Boundaries:**
   Delivery completion requires four distinct, non-fungible facts:
   - Verified payment capture in paise.
   - Server-side arrival confirmation and worker command publication.
   - Actuator hardware confirmation (`True` return or explicit `confirm_command_execution`).
   - Correlated inner-lid closure report with verified `is_empty: true` sensor observation.
   No transport PUBACK, serial write, or app-level callback can substitute for these physical and cryptographic milestones.

---

## Remaining commissioning requirements (Robotics / Hardware Team)

The software and communication transport layers are complete. The following items belong to the robotics and navigation engineering team and must be completed before physical pilot testing:

1. **Hardware Adapter Implementation:**
   - Implement real Python functions for `guard`, `on_unlock`, and `clock_synchronized` (see `integrations/device_connector/examples/wiring.py`).
   - `guard` must query real physical lid interlocks, current compartment assignments, and hardware fault status. It must never return `True` unconditionally.
   - `on_unlock` must interface with the STM32/GPIO actuator controller.
2. **Per-Device Credential Provisioning:**
   - Enroll real bot UUIDs in the backend database.
   - Generate per-bot 32+ character HMAC secrets for signed HTTP (`X-Device-Signature`).
   - Provision TLS client certificates for HiveMQ / Mosquitto with ACLs restricted strictly to `hostelxpress/v1/bots/{bot_id}/*`. No bot may possess permission to publish to `commands/`.
3. **Physical Sensor Drivers:**
   - Real timestamped sensor feeds for outer lid status, inner lid status, and ultrasonic/optical parcel emptiness.
   - GPS coordinate feeds (or explicit `None` when indoors/no-fix).
4. **Third-Party Delivery Platform Rider-OTP Adapter:**
   - The connector does not validate third-party delivery platform OTPs. A separate physical or mobile interface must verify the rider before opening the outer lid.
5. **Emergency Stop & Interlock Systems:**
   - Electrical and mechanical interlocks that keep lids locked during transit, navigation failure, power loss, or emergency stop triggers, independent of backend communication.
6. **Camera Ring Buffer & Evidence Upload:**
   - Local rolling 120-second camera buffer on fault or tamper, with private S3/storage evidence upload.

---

## External dependencies and Phase 5 release blockers

The following dependencies are external to local engineering and remain pending before Phase 5 deployment and pilot operations:

1. **Physical Android Device Acceptance:**
   - Standalone APK installation on real Android hardware.
   - Testing on mobile networks, TalkBack accessibility, and reconnection handling.
2. **Payment Gateway Activation (Razorpay):**
   - Completion of Razorpay KYC and account activation.
   - Authorized end-to-end sandbox/live webhook verification with live signature keys.
3. **Production Infrastructure & SMS:**
   - Live Supabase project deployment and DNS configuration.
   - Production OTP/SMS provider onboarding for student phone verification.
4. **Security & Pre-Commit Audit Resolution:**
   - Formal review and resolution of the 10 Mimosa L3 pre-commit scan findings on test fixture credentials and local loopback paths documented in `docs/reviews/2026-11-03-adapter-checkpoint.md`.

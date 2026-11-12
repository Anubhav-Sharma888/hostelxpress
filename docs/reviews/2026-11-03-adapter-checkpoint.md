# Adapter acceptance checkpoint — 3 November 2026

Scope of this pass (per the user's dispatch): finish and run the adapter acceptance harness only. No Android build, live services, real hardware, commits, or pushes. The committed signup fix (67fd88f) is untouched.

## Workload isolation (verified before and during the run)

Every harness execution ran inside one `systemd-run --user --scope` with `MemoryHigh=2800000000`, `MemoryMax=3500000000`, `MemorySwapMax=0` and `nice -n 10`. Observed on the final run: `memory.max 3499999232`, `memory.swap.max 0`, `memory.high 2799996928`; peak `memory.current 82,210,816` bytes; `memory.events: low 0 high 0 max 0 oom 0 oom_kill 0`. All disposable services (PostgreSQL, Mosquitto, uvicorn) were children of the scoped process and were stopped by the harness's own cleanup; no detached jobs remain. The WSL-wide limits were not modified. Three uncommitted files were preserved throughout.

## Harness finished and passing

`tests/integration/adapter_acceptance.py` (new, opt-in via `HOSTELXPRESS_ADAPTER_ACCEPTANCE=1`) runs the real FastAPI backend (worker + MQTT bridge) and the real `hostelxpress_link` connector against a private loopback TLS Mosquitto and a disposable PostgreSQL 17 schema. Observed result of the passing run (`harness_rc=0`):

| Acceptance case | Observed |
| --- | --- |
| Uncertain asynchronous unlock | exactly 1 actuation; intent durable before the callback |
| Crash without confirmation, restart on the same ledger | replay blocked; redelivery re-acked from the recorded decision without re-actuation |
| Silent late confirmation after restart | refused by the connector (ValueError), by design |
| Backend view of the orphaned command | `rejected` — operator reconciliation required |
| Expired-TTL command / retained delivery | both rejected without actuation; rejection acks retained in the device's ordered durable queue because the server rightly refuses acks for commands it never issued |
| Captured payment without arrival/telemetry (bot 2) | no unlock command created; order stays `Pending` |
| Duplicate durable event after a lost response | receipts `[duplicate:false, duplicate:true]`; exactly one stored row |
| Stale (out-of-order) observation | durably stored as `reconciliation_required` and surfaced via `pending_reconciliations`; acknowledge marks only the local alert |
| Clean synchronous execution + correlated inner-lid closure with an empty reading | order `Completed`; no re-actuation; no reconciliation |

A second full clean run produced identical results (the suite is deterministic).

## Connector contract facts the harness pinned down (now documented in the README acceptance-harness section)

- Boot anti-clone: a second concurrent link for the same bot retires the first boot server-side; later telemetry from the retired boot is refused. The harness therefore runs its stale-clock link last.
- The device's critical queue is strictly ordered: one permanently unmatchable receipt head-blocks later events. Rejection acks for commands the server never issued are retained for operator reconciliation — the harness sequences them last on purpose.
- `confirm_command_execution` requires the locally `accepted` state; the constructor deliberately flips uncertain rows to `rejected/execution_uncertain` at startup.

## Files changed in this pass (uncommitted, preserved)

- `tests/integration/adapter_acceptance.py` — new harness (finished and passing)
- `integrations/device_connector/README.md` — quickstart table + upfront config-validation notes + acceptance-harness section
- `services/api/tests/test_profile_real_user.py` — SQL-boundary trigger-contract test (`test_auth_trigger_seeds_profile_names_from_metadata`); passed 9/9 in its file on a disposable PG17 during the 31 October pass

## Full local regression sweep — 3 November 2026 (supplement)

One foreground `systemd-run --user --scope` (`MemoryMax=3500000000`, `MemoryHigh=2800000000`, `MemorySwapMax=0`, `nice -n 10`); effective cgroup verified before testing (`memory.max 3499999232`, `memory.swap.max 0`). Peak `memory.current 1,207,414,784` bytes during Metro+Playwright; `memory.events` showed only `high 21970` throttling events, `max 0 oom 0 oom_kill 0`. One workload at a time; nothing live contacted; WSL-wide settings unchanged.

| Check (sequential) | Observed result |
| --- | --- |
| `scripts/check_phase0.sh` | 17 MQTT contract tests OK |
| Schema/RLS assertions, fresh disposable PG17 (`--database`) | passed; fixtures rolled back (`ROLLBACK`), cluster stopped and deleted after |
| Backend suite, separate disposable `hostelxpress_sweep_backend_test` database | **48 passed, 0 skipped** (47 prior + the new SQL-boundary trigger-contract test) — database tests verifiably ran |
| Connector suite | 17 passed, 3 subtests |
| App tests / typecheck / lint / web export | 30 passed / 0 failed; all four green |
| Playwright selection | unset → 6 demo tests; `HX_E2E_REAL=1` → 3 real tests; `verify-selection.mjs` OK, no overlap |
| Demo journeys (`HX_E2E_REAL=0`, local demo stack inside the scope) | **6/6 passed** across desktop/tablet/mobile; preview PNGs regenerated by the run were restored to HEAD (0 dirty) |
| `git diff --check` | clean (rc=0) |
| Cleanup | all sweep services stopped; post-cleanup port scan `ALL_PORTS_CLEAR`; no detached jobs |

Runner note: the first sweep execution reported `SERVERS_STILL_UP` — a runner ordering bug (the port scan ran before the runner stopped its own disposable PostgreSQL on 55437). Fixed in `.tools/run-sweep.sh` (stop, then scan); post-cleanup scan verified `ALL_PORTS_CLEAR`. No product code or test changed due to it.

## Publication blocker — 4 November 2026 (recorded, not bypassed)

The `docs/progress.md` + checkpoint-record commit was prepared and staged (2 files, 73 insertions) but the push never happened: Mimosa's L3 pre-commit scan blocked the commit with 10 high-severity findings across the whole working mirror — none of them in the two staged record files:

- `tests/integration/mqtt_tls_proof.py:94-96` "hardcoded credentials" (these are runtime `secrets.token_urlsafe` fixture values), `:121` "path traversal" (runtime-built local Mosquitto config paths), `:244` "SSRF" (the negative test deliberately POSTs to the loopback backend);
- `services/api/tests/test_security_qa.py:22,152`, `test_hardening.py:37`, `test_payments_devices.py:16` "hardcoded credentials" (synthetic local test-fixture secrets);
- `integrations/device_connector/src/hostelxpress_link/link.py:96` "path-traversal entry" (the operator-provisioned ledger path parameter, by design a local filesystem path).

Triage assessment: the fixture credentials are runtime-generated or synthetic local-only values that never reach production; the loopback request is the transport proof's intended target; the ledger path is operator-provisioned by contract. They are findings against test-harness idioms, not production secrets or exploitable product code — but they are recorded here verbatim rather than waived, and remediation (explicit fixture marking, an allowlisted request target check in the proof, a ledger-path validation note or guard) belongs to a dedicated, separately authorized pass with the affected suites rerun. Mimosa also states its coverage is incomplete; that caveat applies to this assessment too.

The staged records are preserved intact (`docs/progress.md`, `docs/reviews/2026-11-03-adapter-checkpoint.md`); publishing them needs either a Mimosa-passing rescan after remediation or the user's explicit decision on the findings. GitHub remains at `67fd88f`; nothing was pushed.

## Remaining work (not started in this pass)

1. Full regression sweep (backend 47, connector 17+3, app 30, phase0 17, selection verifier) — the harness is additive; nothing else was touched.
2. Current-source standalone QA APK rebuild with fresh hashes/manifest evidence (was interrupted by a VM recycle on 1 November; explicitly out of scope in this pass).
3. Phase 4 record (`docs/phase4-review.md`) once the robotics team's real adapter, identities, arrival conditions and OTP authorization exist; this harness is engineering evidence, not hardware acceptance.
4. Phase 3 phone acceptance still pending with the user; demo stack start command: `bash scripts/run_demo.sh` (app on http://localhost:8081).
5. No sign-in was required for this pass; nothing live was contacted.

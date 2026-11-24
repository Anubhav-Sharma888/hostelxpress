# HostelXpress audit remediation and branch reconciliation — 24 November 2026

## Scope and source bases

This continues the user-authorized “Audit and merge HostelXpress” task, including its instruction to fix blockers and merge only after verification. All development and tests ran in Ubuntu22.04. Existing dirty main and OTP-staging worktrees were left intact; changes were isolated under the canonical checkout's ignored `.tools/audit-merge-20261124` worktree on `fix/audit-merge-20261124`.

- Main before: `d72d8c869d74bbeb16348cf550913683602a3547`.
- Latest OTP/payment feature base: `3770f27fab9cafec24b9c70ff4aad3c8bd9f8443`.
- QA branch reconciled: `743d62004da779f9695e3cbffc8209e7a6a79fee` (v1.5.2).
- Develop is already an ancestor of the feature base. The reconciliation preserves both histories; no released tag is moved. The resulting PR records the exact final audit head, CI runs and main merge SHA.

The four conflicting QA commits were reviewed semantically rather than replacing newer OTP/payment code. Six merge conflicts were resolved. Dedicated history, active-only navigation, staging booking confirmation and the bounded cold-start sign-in path are retained. Newer confirmed campus destinations and configurable support remain intact; hardcoded support numbers were removed from the merged UI.

## Corrected blockers

- Staff-authorized outer commands can publish after current assignment, rider window, empty selected bay, fresh telemetry and closed-lid guards pass.
- Every inner publication revalidates captured payment and a consumed OTP2 bound to this order/bot/bay, predating command issuance. Commands are explicitly timestamped after OTP consumption rather than using PostgreSQL transaction-start time.
- New migration `0005_command_authorization.sql` quarantines unproven pending legacy inner commands and records the upgrade. Existing released migrations are unchanged. Published/executed history is preserved for reconciliation.
- Production startup requires application migrations0004 and0005 before MQTT bridge startup, even when OTP configuration is disabled.
- QR creation relocks the order after provider I/O, durably retains provider identity/expiry and withholds a payable QR if eligibility changed. It does not roll back evidence of an external provider request.
- Serialized `pickup_state` is order/bay-specific. A different compartment's rover-wide UNLOCKED state cannot hide this student's OTP2 or imply collection readiness. Pending, rejected, expired and missing evidence fail closed.
- Readiness requires executed order-bound command and fresh assigned-bay open/full sensor proof, plus healthy fresh rover telemetry. An execution ACK or partial event cannot borrow the timestamp of a previous closed snapshot. Re-ACKs do not invalidate newer sensor readings.
- The connector's public `report_lid_event` accepts optional explicit observations for both lids, validates booleans and consistency, and can send the full snapshot required for completion. Existing partial calls remain accepted as observations; they do not establish fresh full physical proof.
- The acceptance harness now uses real local owner-scoped OTP2 issuance and signed connector redemption before simulated unlock. Its temporary socket path and cleanup are safe for nested Linux worktrees.

## Dependencies and repository safeguards

The student lockfile originally reported15 npm vulnerabilities (3high/12moderate). Compatible updates removed the high findings. A targeted `@expo/fingerprint` minimatch override to patched11.x removes the final moderate chain without downgrading Expo or forcing a framework major change. Fresh `npm audit` reports zero vulnerabilities. Enabling Dependabot also exposed a runtime OpenTelemetry advisory, addressed by pinning opentelemetry-api1.45.2 (GHSA-mf5v-w3w3-f6cg) rather than the affected1.45.1. Android fingerprint generation and web export verified compatibility. Advisory reference: https://github.com/advisories/GHSA-g3hv-75wg-m249 . CI now checks the locked dependencies and fingerprint compatibility.

GitHub secret scanning, secret push protection, vulnerability alerts and automated security updates were enabled. Main protection requires up-to-date `foundation`, `backend` and `student` checks, a PR, conversation resolution and no force pushes/deletion; administrators are covered. No mandatory human approval count was added to this single-owner workflow. Code scanning automation is not newly claimed.

## Fresh local verification

- Backend/connector: **176 passed**, **16 subtests passed**; no skipped database tests. Only disposable socket-only PostgreSQL17 used.
- Student: **41 passed**, typecheck and lint passed.
- Phase0 contracts: **17 passed**; schema/RLS assertions passed on a separately initialized disposable database, changes rolled back.
- Web export passed; Android fingerprint generation returned a nonempty hash and29 sources; no physical Android rebuild is claimed.
- Six demo browser journeys passed across desktop/tablet/mobile, including booking/payment/collection simulation, history/profile/help and offline recovery.
- Demo/real browser selection verifiers passed under both parent-mode settings; no real Auth tests ran.
- Real local adapter harness passed: exactly one uncertain actuation callback, restart replay blocked, silent late confirmation refused, backend reconciliation rejection, expired/retained commands refused, payment without arrival produces no unlock, duplicate event receipt deduplicated, stale event reconciled, clean simulated order completed.
- Independent source review identified two additional timestamp reuse cases; both were reproduced by failing tests and corrected. Final review found no remaining code blockers.

All heavy jobs were serialized at low priority inside project scopes, capped at3.5GB memory (high2.8GB,swap0), two permitted CPUs and CPUQuota200%. The shared project slice was also reverified and capped; WSL-wide settings were unchanged. Browser/demo and harness services were stopped after verification. The audit database is stopped at final cleanup.

## Deployment, releases and acceptance boundaries

Read-only Render inspection confirms staging tracks `develop`, auto-deploy off, live at `e78036722ed7edee9d1027f2c1556161b8355623`. Read-only Supabase inspection confirms only0001–0003 are applied. **Do not deploy this code to that database until0004 and0005 have been separately authorized and applied.** No remote migration or deployment occurred during this audit; payments and real hardware were not enabled.

Before any later approved upgrade, stop command publishers, apply0004 then0005, inspect quarantined/published/uncertain commands and retain custody/ledger evidence. Database quarantine cannot recall a command already delivered to a device. Rolling back to pre-OTP2 publication code must not re-enable publication; disable publishers and preserve challenges/outbox receipts during operator reconciliation.

A before/after inventory compares all11 existing release tags,11 prereleases and24 uploaded asset IDs/names/sizes/server SHA-256 digests. Existing releases/APKs are retained, not rebuilt or overwritten. This audit does not create a new APK release: users of existing binaries still have those versions. A future release must build and accept the reconciled code separately. Current GitHub checks and merge/release integrity confirmation are recorded in the PR and completion handoff.

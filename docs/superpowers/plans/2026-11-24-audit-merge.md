# Audit remediation and branch reconciliation implementation plan

> For agentic workers: execute task-by-task with test/review evidence before merging.

**Goal:** Reconcile latest verified OTP/payment work and v1.5.2 QA corrections, fix audit blockers, and merge only the tested result to main while preserving every release/tag/asset.
**Architecture:** A clean Ubuntu worktree starts at feature 3770f27; merge the divergent QA line while retaining newer per-order OTP/payment semantics. Correct command eligibility and QR concurrency at their database boundaries; verify app pickup independently per order. Deployment, real database migrations, payment enablement and physical operations are excluded.
**Tech stack:** Existing FastAPI/PostgreSQL/MQTT, React Native/Expo, pytest, Node tests, Playwright and GitHub Actions.
**Spec:** User-authorized continuation of “Audit and merge HostelXpress”, including its last “fix all and complete the work” instruction and exact findings.

## Global constraints

Ubuntu only. Preserve both existing dirty worktrees and all tags/releases/assets. Shared hx-audit.slice: MemoryMax=3500000000, MemoryHigh=2800000000, MemorySwapMax=0, CPUQuota=200%; inherited affinity to first two permitted CPUs, nice10, one heavy job at a time. No paid infrastructure, deployment, live payment/OTP/hardware calls. If an Android build is needed: max-workers2/no-parallel/native jobs2.

## Review focus

- Commands authorized by staff or student must publish only to the matching order/bay at the allowed physical and payment state.
- Pending pre-OTP2 inner unlocks cannot bypass current authorization after upgrade.
- Provider requests racing with order failure/completion/payment must not expose stale payable QR data.
- Other compartments opening must not hide this student's paid pickup challenge.
- Reconciliation retains QA confirmations, booking history and bounded cold-start behavior without reintroducing old authorization semantics.

## Tasks

- [x] Snapshot remote branch/tag/release inventory and preserve dirty trees.
- [x] Merge v1.5.2 QA branch into isolated feature-based audit branch; resolve all conflicts semantically.
- [x] Add failing regressions for each confirmed backend/app blocker, then implement minimal corrections.
- [x] Resolve dependency advisories with compatible updates and document any genuinely unfixable residual; no forced major upgrade.
- [x] Run fresh serial disposable database/backend/connector/app/contract/browser checks; review final changes independently.
- [ ] Push audit PR, verify exact-SHA GitHub checks, merge main if all gates pass and compare release/tag/asset inventory unchanged.
- [ ] Save exact before/after SHAs, checks and remaining external acceptance in review/progress records; no deployment.

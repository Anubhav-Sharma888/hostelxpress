# Application delivery plan

The user's Phase 0 approval authorizes Phase 1 application/backend work on 27 October 2026. Gazebo, SLAM, route planning, firmware, motor control, and navigation remain the other team's responsibility.

| Phase | Incremental deliverable | Engineering hours |
| --- | --- | --- |
| 0 (complete) | Ubuntu environment, schema, communication contract | 8–16 |
| 1 (complete) | Working student application/backend foundation and complete local demo journey | 24–40 |
| 2 (complete, 2 items deferred — see `docs/phase2-review.md`) | Live authentication/payment configuration and backend hardening | 16–24 |
| 3 (current) | Complete mobile screen coverage, accessibility, device QA, final visual polish, real Supabase sign-in | 56–80 |
| 4 | Connect and validate the hardware team's adapter against agreed event/command contracts | 16–24 |
| 5 | End-to-end failure recovery, deployment, and release checks | 24–40 |
| Total | All phases | 144–224 |
| Remaining after Phase 2 | Phases 3–5 | 96–144 |

Allow approximately 175–280 hours overall with integration contingency. These are planning estimates for engineering effort, not a promise of elapsed agent runtime. Parallel work can shorten implementation; account activation, approvals, and hardware-team availability can add waiting time. Do not double-count implementation already completed in an earlier phase when revising the remaining budget.

Each phase has a dated review record and an integrity check. The user authorized autonomous application work through Phase 5 on 28 October 2026 (see AGENTS.md), with unavailable user and hardware inputs recorded rather than fabricated. On 29 October the user requested publication of the verified GitHub checkpoint. Phase 3 still requires actual phone QA; later engineering work must not imply that this acceptance occurred.

## Hardware integration boundary

The app never imports the robotics team's navigation source. The backend and a small Python connector exchange versioned messages. The robotics team keeps its own repository/runtime and wires sensor readings and actuator-result callbacks into that connector. Hardware credentials are per bot and never included in the student app.

A separate simulator exercises the same communication interface without importing Gazebo or operating hardware. Live commissioning must verify credentials, broker permissions, clock synchronization, local lid interlocks, duplicate commands, reconnects, and execution acknowledgements.

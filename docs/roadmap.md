# Application delivery plan

The user's Phase 0 approval authorizes Phase 1 application/backend work on 27 October 2026. Gazebo, SLAM, route planning, firmware, motor control, and navigation remain the other team's responsibility.

| Phase | Incremental deliverable | Engineering hours |
| --- | --- | --- |
| 0 (complete) | Ubuntu environment, schema, communication contract | 8–16 |
| 1 (current) | Working student application/backend foundation and complete local demo journey | 24–40 |
| 2 | Live authentication/payment configuration and backend hardening | 16–24 |
| 3 | Complete mobile screen coverage, accessibility, device QA, final visual polish | 56–80 |
| 4 | Connect and validate the hardware team's adapter against agreed event/command contracts | 16–24 |
| 5 | End-to-end failure recovery, deployment, and release checks | 24–40 |
| Total | All phases | 144–224 |
| Remaining after Phase 0 | Phases 1–5 | 136–208 |

Allow approximately 175–280 hours overall with integration contingency. These are planning estimates for engineering effort, not a promise of elapsed agent runtime. Parallel work can shorten implementation; account activation, approvals, and hardware-team availability can add waiting time. Do not double-count implementation already completed in an earlier phase when revising the remaining budget.

Each phase ends at an explicit user review gate. Phase 1 does not authorize proceeding through all later phases without that review.

## Hardware integration boundary

The app never imports the robotics team's navigation source. The backend and a small Python connector exchange versioned messages. The robotics team keeps its own repository/runtime and wires sensor readings and actuator-result callbacks into that connector. Hardware credentials are per bot and never included in the student app.

A separate simulator exercises the same communication interface without importing Gazebo or operating hardware. Live commissioning must verify credentials, broker permissions, clock synchronization, local lid interlocks, duplicate commands, reconnects, and execution acknowledgements.

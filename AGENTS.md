# Development environment

All application development, dependency installation, code execution, and tests run in Ubuntu Linux.

The authoritative checkout is:
`/home/anubhav_sharma_888/src/hostelxpress`

Ubuntu distribution: `Ubuntu-22.04` on WSL 2. From the Windows-hosted tool session, use `wsl.exe --distribution Ubuntu-22.04 --cd /home/anubhav_sharma_888/src/hostelxpress --exec ...`. WSL access may require the execution tool's sandbox escalation. Do not substitute Windows Python, Node.js, or Git Bash for Linux tools.

The Windows folder `C:\Anubhav Sharma\Projects\HoestelXpress` contains review copies of source deliverables. Edit the authoritative Linux checkout and copy changed source files back for review when needed. Do not copy Linux virtual environments, .tools, node_modules, or .git to Windows. Inspect and reconcile any explicit user edits before refreshing review copies.

Activate the project tools inside Ubuntu Bash with `source .tools/env.sh`.

# Scope and approval gates

The user's responsibility is the entire student application, backend, authentication, payments, database, and app/server/hardware communication interfaces.

Gazebo, SLAM, route planning, navigation, firmware, motor control, and physical hardware implementation are outside this repository's scope.

Respect the user's explicit phase approval gate. Phase 0 and Phase 1 are complete, locally validated, and published to https://github.com/Anubhav-Sharma888/hostelxpress (initial commit `7426035`; both GitHub Actions workflows pass). Phase 2 (live authentication/payment configuration and backend hardening, per `docs/roadmap.md`) is **not** yet authorized: it starts only after the user explicitly approves the Phase 1 review in the conversation. When the user approves, first update this paragraph to record the new authorization, then implement. Always prepare a concrete, reviewable result and stop for the required phase approval before implementing the next phase.

# Verification

Use `bash scripts/check_phase0.sh` after activating the venv. Database tests require a disposable initialized PostgreSQL instance and explicit opt-in. Never run the Auth bootstrap fixture against a real Supabase database.

Phase 1 validation status and the phase record are in `docs/phase1-review.md`; the backend and app operational guides are `services/api/README.md` and `apps/student/README.md`.

Never claim that local PostgreSQL tests cover real Supabase Auth/API, live HiveMQ permissions, Razorpay sandbox behavior, or physical actuation. Those require their own integration checks.

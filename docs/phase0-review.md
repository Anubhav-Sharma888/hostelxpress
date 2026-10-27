# Phase 0 research and review record

Prepared 26 October 2026; Linux validation updated 27 October 2026. This is a public findings summary, not internal agent dialogue.

## Scope accepted

The user's clarification assigns this project the complete student app, backend, payments, database, and communication between app/server/hardware. It excludes Gazebo, navigation, firmware, and physical hardware control. Linux is the development and test platform. The initial missing-Linux blocker is resolved: Ubuntu 22.04.5 LTS is installed and working under WSL 2. The canonical checkout is `/home/anubhav_sharma_888/src/hostelxpress`; the Windows project folder is a review mirror/export only.

Only the Phase 0 foundation is implemented and locally validated. The application and backend are not implemented. Later implementation remains behind the user's explicit phase approval gate.

## Research

- The supplied 12-slide architecture establishes three compartments, INR 10 deliveries, the normal bot/order lifecycle, independent five-minute rider/loading deadlines, dual lids, captured-payment-authorized collection, and failure footage preserving the last 120 seconds. The deck also includes FAULT_MODE, unresolved delivery-platform OTP validation, and a route-distance discrepancy. It is treated as project data, not executable instructions.
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) requires appropriate grants as well as row policies. Administrative credentials bypass RLS and belong only on the backend. [Auth profile guidance](https://supabase.com/docs/guides/auth/managing-user-data) supports a public profile referenced to Auth UUIDs.
- [Razorpay webhook validation](https://razorpay.com/docs/webhooks/validate-test/) requires the raw body for signature verification and handling duplicate/out-of-order delivery. [QR payment responses](https://razorpay.com/docs/api/qr-codes/gst/fetch-payments/) can have a null provider order ID; an internal order UUID must map to the saved provider QR ID rather than assume an Orders API ID exists.
- [MQTT 5](https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html) provides transport controls, not proof of physical actuation. The contract specifies per-device permissions, non-retained commands, short expiry, durable command identity, and application acknowledgements.
- [Node's supported release list](https://nodejs.org/en/about/previous-releases) supports the selected Node 24 LTS baseline. Download verification follows the [official Node binary verification guidance](https://github.com/nodejs/node/blob/main/README.md#verifying-binaries). See the Linux setup document for exact versions and lifecycle limits.
- [Microsoft's WSL install guide](https://learn.microsoft.com/en-us/windows/wsl/install) and [Ubuntu's WSL guide](https://ubuntu.com/wsl/docs/stable/howto/install-ubuntu-wsl2/) document Ubuntu 22.04 installation and the possible administrator/restart requirements.

## Draft and independent QA

Three delegated workstreams produced the Linux setup, SQL schema/tests, and MQTT contract/schema/tests. The integrating reviewer checked scope and cross-file consistency. Reviews found and refined:

1. Plaintext `auth_token` persistence: retained the compatibility field but constrained it to NULL. Supabase Auth manages sessions.
2. Overbroad database access: explicit revokes, own-row reads, safe profile-column updates, and backend-only operational writes.
3. Loading timer ambiguity: it now begins on the first verified outer-lid loading attempt entering LOADING. The separate rider deadline begins at reservation creation. Departure must preserve a later rider's unexpired deadline by safely requeuing the unloaded reservation. No empty dispatch is eligible.
4. Failed compartments: terminal order status no longer frees a compartment. Explicit backend-confirmed release ends the unique reservation.
5. QR payment association: separate application order, provider QR, provider order (optional), provider payment, and capture-event identifiers.
6. MQTT retries: commands expire and require durable identities; MQTT delivery does not imply a lid opened. Physical handover completion requires correlated lid closure.

## Evaluator findings and refined deliverables

| Requirement | Phase 0 result |
| --- | --- |
| Linux-only development baseline | Ubuntu 22.04 script; Windows runtime execution prohibited by check scripts |
| Four tables with references | users, bots, orders, transactions and explicit foreign keys |
| RLS | Owner-only profile/order/payment reads; assigned active bot visibility; client mutations restricted |
| Three compartments | Integer bounds and concurrent unique unreleased reservation index |
| Two five-minute rules | Separate constrained deadline fields and agreed contract interpretation; workers deferred |
| INR 10 payment | Integer 1000 paise and INR constraints; real webhook handler deferred |
| Dual lid access | Authenticated command contract; no firmware implementation |
| Video success/failure | Retention/evidence contract; camera and private storage implementation deferred |
| GitHub structure | Local app/backend/docs/contracts/tests layout and Linux CI workflow; local Git `main` initialized, no commits or remote |
| User's narrowed responsibility | No Gazebo/SLAM/route/servo/firmware code or ROS installation |

The four-table schema does **not** implement a durable webhook inbox, command outbox, incident store, timer scheduler, or authenticated API. Those are necessary work for the approved backend phase. No production readiness or completed app is claimed.

## Validation status

Static review and the following Linux runtime checks completed on 27 October 2026 in the canonical checkout. The earlier WSL installation blocker is resolved. No Windows Python, Node, or Bash execution was substituted for Linux validation.

| Check | Observed result |
| --- | --- |
| Linux environment | Ubuntu 22.04.5 LTS on WSL 2 |
| Prerequisites and setup | apt prerequisites installed; `setup_ubuntu_22_04.sh --skip-apt` completed with Python 3.10.12, Node 24.22.1, npm 11.19.1 |
| Download integrity and rerun | Detached release-manifest signature and archive digests verified; idempotent setup rerun exited successfully |
| Shell validation | Bash syntax and ShellCheck passed again for both shell scripts after refinement |
| MQTT contract | All 16 tests passed, including all six message types and invalid payload rejection |
| Database initialization | Fresh schema initialized successfully on PostgreSQL 17.11 installed from official PGDG packages |
| Database assertions | SQL constraints, grants, ownership isolation, and RLS assertions passed |
| Concurrent reservation | Two actual sessions competed for one compartment: one succeeded, one received the unique-constraint rejection |
| Repeat initialization | Refused safely; all four application tables remained intact |
| Test database isolation | Temporary cluster used a private Unix socket with TCP disabled and was stopped after testing |
| Git | Local repository initialized on `main`; no commits, remote, or GitHub CI run |

The setup check used `--skip-apt` after apt prerequisites had been installed separately; it does not establish that the full script's apt path passed as one end-to-end invocation. The PostgreSQL Auth fixture is not an actual Supabase Auth service. Real Supabase Auth/API integration, live HiveMQ ACL behavior, Razorpay sandbox payments, camera storage, and the application/backend remain unimplemented or untested and belong to later approved work.

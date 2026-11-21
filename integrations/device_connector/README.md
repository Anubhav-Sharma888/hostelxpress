# Hostelxpress device link

A small installable **communication connector** for the hardware/navigation team's existing Python code. It implements no ROS node, navigation, GPIO, motor, servo, platform OTP, or camera capture.

Install from the canonical Linux repository:

```bash
source .tools/env.sh
python -m pip install -e integrations/device_connector
```

The production transport uses TLS MQTT 5 for commands and periodic telemetry, plus signed HTTPS for durable critical events and command acknowledgements. A separate provisioned credential identifies each bot. Configure the names in `.env.example` using the backend/device provisioning process; do not commit real secrets. `from_env` reads exported process variables and does not automatically load a file.

## Quickstart

Export one value per provisioned bot, then attach your existing functions as shown below:

| Variable | Required | Meaning |
| --- | --- | --- |
| `HOSTELXPRESS_BOT_ID` | yes | Backend-enrolled bot UUID (canonical lowercase) |
| `HOSTELXPRESS_API_URL` | yes | Backend HTTPS origin, no path or credentials (HTTP only for explicit loopback development) |
| `HOSTELXPRESS_DEVICE_SECRET` | yes | Per-device HMAC secret, at least 32 characters |
| `HOSTELXPRESS_MQTT_HOST` / `_USERNAME` / `_PASSWORD` | yes | TLS broker identity restricted to this bot's topics |
| `HOSTELXPRESS_MQTT_PORT` | no (default 8883) | TLS listener port |
| `HOSTELXPRESS_MQTT_CA_FILE` | production: yes | CA bundle verifying the broker certificate and hostname |
| `HOSTELXPRESS_LEDGER` | no (default under `~/.local/state/hostelxpress`) | Private persistent SQLite ledger — never `/tmp` |
| `HOSTELXPRESS_ALLOW_LOOPBACK_HTTP` | no (`1` enables) | Explicit opt-in for local development transport only |

Configuration is validated up front: a missing variable, malformed UUID, weak secret, credential-bearing origin, or a non-HTTPS API URL outside explicit loopback development fails immediately with the specific reason instead of misbehaving mid-run. Supply the three callbacks from your own code — `guard` (literal `True` only after checking the current assignment, fresh sensors, fault state and both lid interlocks), `on_unlock` (`True` on confirmed execution, `False` on failure, `None` for asynchronous plus `confirm_command_execution(command_id)` after real confirmation), and `clock_synchronized` (actual time-sync health). Every default refuses action until your team deliberately supplies real checks.

With your team's real functions already defined, attaching is three lines:

```python
link = HostelxpressLink.from_env(guard=robot.can_unlock, on_unlock=robot.unlock_confirmed, clock_synchronized=robot.clock_is_synchronized)
link.connect()
link.report_arrived(order_id, compartment)
```

Import `HostelxpressLink` from `hostelxpress_link`. `report_arrived` queues an observation; server authorization/arrival checks still decide its effect. The worker retries queued events while the connection is running. `link.flush_events()` provides an explicit durable-delivery attempt, and `link.pending_events` exposes backlog. A returned message ID means locally queued rather than server accepted; only a matching `{stored:true,message_id}` HTTP receipt removes critical data.

`guard(command)` must return the literal `True` only after reading the current local assignment, fresh sensors, fault state, and both lid interlocks for the requested compartment. Missing callbacks, missing synchronized-clock confirmation, unknown sensors, invalid assignments, expired/retained commands, or a guard exception refuse actuation. Callbacks should be bounded and must not block the MQTT network loop; commands are processed by a separate worker.

`on_unlock(command)` belongs to the hardware team. Return `True` only on confirmed execution, `False` for failure, or `None` for an asynchronous operation. For asynchronous execution, call `confirm_command_execution(command.command_id)` only after real controller/sensor confirmation. Opening and closing observations are reported separately; execution acknowledgement does not complete delivery.

```python
link.report_telemetry(
    current_lat=gps.lat, current_lng=gps.lng, battery_level=battery.percent,
    clock_synchronized=robot.clock_is_synchronized(),
    compartments=robot.compartment_sensor_snapshots(),
)
link.report_loaded(order_id, compartment, outer_closed=outer_sensor.closed,
                   inner_closed=inner_sensor.closed, is_empty=parcel_sensor.is_empty)
link.report_lid_event(order_id, compartment, lid="inner", closed=inner_sensor.closed,
                      command_id=command_id, is_empty=parcel_sensor.is_empty)
```

Each compartment snapshot is `{compartment:1..3,outer_closed:bool,inner_closed:bool,is_empty:bool}`. Include only actual observations. GPS must be both null if unavailable. The connector never invents a safe sensor reading. Publish telemetry every five seconds; critical events go to the durable HTTP queue. See `docs/hardware-handoff.md` for backend/device responsibilities.

The SQLite ledger is private to one process and one bot. It persists command intent before calling hardware and refuses automatic replay after a crash with uncertain execution. Keep the ledger on persistent Linux storage, never in `/tmp` or recreated on every boot. Do not delete it to clear an error. Monitor backlog/disk space; unavailable storage/HTTP requires operator reconciliation, not an unlock bypass.

The adapter validates all payloads against a bundled copy of `contracts/mqtt/wire.schema.json`; its tests verify the copy matches the repository contract. If the wire contract changes, update the bundled copy and rerun tests together.

```bash
python -m unittest discover -s integrations/device_connector/tests -v
```

The example `examples/wiring.py` has a refusing guard and an unimplemented actuator callback. Connecting it cannot authorize a physical unlock until the hardware team deliberately supplies real checks. No broker/device credentials are included. Unit tests prove local validation and retry behavior; they do not establish real HiveMQ ACLs, physical safety, live payment correctness, or campus navigation.

## Acceptance harness

`tests/integration/adapter_acceptance.py` runs the real connector against the real backend (worker and MQTT bridge enabled), a private loopback TLS Mosquitto, and a disposable PostgreSQL database. It demonstrates, end to end: exactly-once actuation across duplicate delivery and restart, the post-crash refusal to replay or silently confirm an uncertain command, backend rejection of the orphaned command for operator reconciliation, expired and retained command refusal, durable-event deduplication after a lost response, stale observations stored as `reconciliation_required`, no unlock for captured payment without arrival/telemetry, and completion only through a correlated inner-lid closure with an empty reading.

```bash
source .tools/env.sh
HOSTELXPRESS_ADAPTER_ACCEPTANCE=1 python3 tests/integration/adapter_acceptance.py
```

Everything is local and synthetic. Passing this harness still does not establish real HiveMQ ACLs, live payment capture, or physical safety — those need the hardware pilot checks in `docs/hardware-handoff.md`.

## Delayed observations that require reconciliation

A backend receipt can confirm durable storage while setting `reconciliation_required:true`, for example when an event arrived too late to establish a safe state transition. The connector removes the transport queue item but persistently exposes it in `link.pending_reconciliations`, including the original payload and receipt. An optional `on_reconciliation` callback can alert the team's operator interface. Monitor this list after restart as well as `pending_events`. `acknowledge_reconciliation(message_id)` only marks the local alert handled; it cannot change an order or authorize another physical action. Never interpret a stored observation as a successful unlock or silently replay an expired command.


### Gate 2 rider OTP submission (HostelXpress-owned codes)

The backend's opt-in rider OTP flow issues a six-digit code to an authenticated
Gate 2 operator. Only the assigned, provisioned rover may submit that code to
the backend. To connect the rover-side keypad/code-entry component, call:

```python
receipt = link.submit_rider_otp(order_id, compartment, "003721")
# "queued_not_executed" means only that the server queued a short-lived command.
# Await the actual signed MQTT unlock_outer command and local safety guard.
```

The connector signs the exact JSON bytes with the bot's HTTP HMAC credential,
requires a synchronized clock and HTTPS (or explicit loopback test transport),
and rejects invalid code shapes before sending. It never stores the code in
the SQLite event ledger, attempts SMS delivery, invokes the actuator, or
interprets an HTTP response as physical opening.

A failed network response can be ambiguous: the server might have consumed
the code and queued the command before the client saw the response. **Do not
blindly retry or issue another code**. Reconcile the command outbox and
physical lid state with the operator. Third-party courier-platform OTPs are
not validated by HostelXpress without a separate approved provider link.
This opt-in feature is not enabled in the current restricted staging APK/API.

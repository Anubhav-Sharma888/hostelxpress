# Hostelxpress device link

A small installable **communication connector** for the hardware/navigation team's existing Python code. It implements no ROS node, navigation, GPIO, motor, servo, platform OTP, or camera capture.

Install from the canonical Linux repository:

```bash
source .tools/env.sh
python -m pip install -e integrations/device_connector
```

The production transport uses TLS MQTT 5 for commands and periodic telemetry, plus signed HTTPS for durable critical events and command acknowledgements. A separate provisioned credential identifies each bot. Configure the names in `.env.example` using the backend/device provisioning process; do not commit real secrets. `from_env` reads exported process variables and does not automatically load a file.

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

## Delayed observations that require reconciliation

A backend receipt can confirm durable storage while setting `reconciliation_required:true`, for example when an event arrived too late to establish a safe state transition. The connector removes the transport queue item but persistently exposes it in `link.pending_reconciliations`, including the original payload and receipt. An optional `on_reconciliation` callback can alert the team's operator interface. Monitor this list after restart as well as `pending_events`. `acknowledge_reconciliation(message_id)` only marks the local alert handled; it cannot change an order or authorize another physical action. Never interpret a stored observation as a successful unlock or silently replay an expired command.

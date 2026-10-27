# Handoff to the hardware and navigation team

The application team supplies the FastAPI service, student application, database, device authentication, and transport contract. The robotics team keeps its existing navigation, ROS/Gazebo, motor control, sensor drivers, STM32 link, interlocks, emergency stop, and camera implementation. Attach those functions to the small connector under `integrations/device_connector`.

## What to exchange before connecting a real bot

1. A backend-enrolled bot UUID, per-device HTTP HMAC secret, and independently provisioned TLS MQTT identity restricted to that bot's topics. Never share one credential across the fleet or give a bot permission to publish commands.
2. The backend HTTPS origin, TLS broker hostname/port and CA trust, and private persistent Linux path for the command/event SQLite ledger.
3. A local order/compartment assignment source, actual timestamped lid/parcel sensor observations, time-sync health check, and an existing confirmed-unlock function. Unknown assignment/sensors/clock/fault state must keep lids locked.
4. Agreed arrival conditions and a verified rider-OTP authorization adapter. The connector does not validate delivery-platform OTPs; the supplied architecture identifies that external integration as unconfirmed. A `parcel_loaded` observation cannot bypass missing outer-lid authorization.

Backend credential provisioning and service commands are documented by the backend owner in `services/api/README.md`. Keep generated device secrets out of chat logs, Git, and app bundles. Replace all example UUIDs/hostnames before real enrollment.

## Attachable Python interface

```python
from hostelxpress_link import HostelxpressLink

link = HostelxpressLink.from_env(guard=robot.can_unlock, on_unlock=robot.unlock_confirmed, clock_synchronized=robot.clock_is_synchronized)
link.connect()
link.report_arrived(order_id, compartment)
```

The three attachment lines reuse your team's functions. The navigation team calls `report_arrived` when its agreed arrival checks hold; it does not transfer a navigation implementation into this repository. Sensor events call `report_loaded` or `report_lid_event`; periodic telemetry uses `report_telemetry` with actual values. The full refusing stub and observation examples are in the connector README and `examples/wiring.py`.

## Stable wire and delivery guarantees

Topics remain `hostelxpress/v1/bots/{bot_id}/{telemetry|events|state|availability|commands|acks}` as defined in `docs/mqtt-contract.md`. The connector implements commands, availability, telemetry, and durable critical event/ack delivery. It uses the canonical `event_type` names such as `parcel_loaded`, `arrived`, and `inner_lid_closed` rather than introducing a second incompatible protocol.

MQTT 5 command subscriptions use nonpersistent sessions and suppress retained delivery. TLS verifies the broker certificate and hostname. Commands are non-retained, last at most ten seconds, target one order and compartment, and require a synchronized clock plus the hardware guard. Paho's MQTT delivery acknowledgement never establishes physical execution.

Critical events/acks use the same canonical JSON at `POST /v1/devices/{bot_id}/messages`. The connector signs the exact raw bytes with the provisioned HMAC secret and current transport timestamp. Backend inbox/state changes are committed before a matching durable application receipt. SQLite retains queued events across network failure; `flush_events` retries without changing their message IDs. The backend deduplicates them. A queued event ID alone is not a successful application receipt.

Command IDs are persisted before calling the actuator callback. Duplicate IDs return the recorded decision without a second callback. A process crash during an uncertain action refuses automatic replay after restart. The team must reconcile actual lid/controller state and the backend before authorizing another operation; never wipe the ledger or invent a successful acknowledgement to recover.

A hardware callback returning `True` certifies confirmed execution. An asynchronous callback returns `None`; after actual confirmation, explicitly call `confirm_command_execution`. Report the correlated inner-lid closure and an actual empty-compartment reading after collection. Captured payment, command execution, and closure remain separate facts. An app callback, transport PUBACK, or simply writing to a serial port cannot complete the order.

## Failure handling and remaining integration work

The SDK contains no actuator, navigation, camera, or platform-OTP implementation. The hardware team owns mechanical/electrical interlocks and emergency stopping even if the application server is unavailable. Software transport guards are an additional boundary.

Camera ring buffers must preserve the last 120 seconds on fault and retain footage until the handover result is known. A normal cleanup requires captured payment and confirmed lid closure. Private storage/incident evidence upload must be connected and verified separately; an unconfigured backend must reject unsupported evidence operations rather than claim a verified upload.

Demo application mode cannot operate physical integrations. Real device enrollment, server authentication, TLS broker permissions, webhook/payment credentials, and hardware checks must be explicitly configured and validated. Do not connect this library to real actuators using a guard that always returns True.

## Acceptance before hardware pilot

- Bot X cannot publish/subscribe as Bot Y or publish any command.
- Missing/incorrect HTTP HMAC, mismatched path/payload bot identity, old transport timestamp, and replayed message effects are rejected or deduplicated safely.
- A correctly signed command with a wrong order, compartment, expired TTL, retained flag, unknown clock, unsafe lid, or active fault never invokes the unlock callback.
- Duplicate delivery and a crash/restart do not repeat an uncertain physical action.
- Network loss preserves critical event/ack backlog until a matching durable backend receipt; disconnecting must leave hardware in a safe state.
- Only an owned, arrived order with verified captured INR 1,000 paise can produce an inner unlock; only correlated physical closure/empty state can release the compartment.

Record actual broker, API, and hardware test results separately. Local unit tests and a test broker do not establish production HiveMQ permissions, real payment capture, or physical safety.

## Delayed observations that require reconciliation

A backend receipt can confirm durable storage while setting `reconciliation_required:true`, for example when an event arrived too late to establish a safe state transition. The connector removes the transport queue item but persistently exposes it in `link.pending_reconciliations`, including the original payload and receipt. An optional `on_reconciliation` callback can alert the team's operator interface. Monitor this list after restart as well as `pending_events`. `acknowledge_reconciliation(message_id)` only marks the local alert handled; it cannot change an order or authorize another physical action. Never interpret a stored observation as a successful unlock or silently replay an expired command.

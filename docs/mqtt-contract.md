# Hardware, server, and application communication contract

Phase 0 contract, version 1. This defines the interface the application team and robotics team implement separately. It contains no navigation, Gazebo, ROS, firmware, or actuator implementation.

## Boundaries

- Student application -> FastAPI: HTTPS with a validated Supabase user access token. Backend derives `user_id` from that token. Never accept a supplied user ID as authorization.
- FastAPI -> Supabase: server credentials held only by the backend; app reads are restricted by RLS. App mutations that affect reservations, payments, bot state, or lids go through the backend.
- Robotics adapter <-> backend: MQTT 5 over TLS. The adapter represents a single provisioned bot. Supabase credentials, student tokens, OTPs, and payment secrets never travel over MQTT.
- Razorpay -> FastAPI: HTTPS webhook with server-side signature verification. A client success screen and device telemetry cannot establish payment success.
- Camera footage -> private object storage by an authorized uploader. MQTT carries an object reference and result, never a video or public signed URL.

API routes and their implementations belong to the next approved application/backend phase. The original deck's `POST /bot/status` and `POST /bot/arrive` can act as device-authenticated ingestion routes if the robotics team requires HTTPS; duplicate HTTP and MQTT reports must share the same event ID and deduplication path.

## Topics and delivery

Base: `hostelxpress/v1/bots/{bot_id}`. `bot_id` is the bot's lowercase UUID, with no braces. Use separate brokers or credential namespaces for test and production.

| Suffix | Publisher | Subscriber | QoS | Retain | Purpose |
| --- | --- | --- | --- | --- | --- |
| `telemetry` | Bot | Backend | 0 | false | GPS and battery every 5 seconds; latest valid reading wins |
| `state` | Bot | Backend | 1 | false | State observations; server validates legal transitions |
| `events` | Bot | Backend | 1 | false | Lid, arrival, fault, and evidence results |
| `availability` | Bot / broker Last Will | Backend | 1 | true | Online presence hint; never authoritative for order state |
| `commands` | Backend | Bot | 1 | **false** | Authenticated, short-lived lid requests |
| `acks` | Bot | Backend | 1 | false | Command acceptance, execution, or rejection |

Only availability is retained. A retained online value can be stale: backend derives health from its own receive time and heartbeat, and stops authorizing unlocks after 15 seconds without a fresh valid bot message. Availability Last Will is `online:false`; a fresh connection publishes `online:true`. The Will's `sent_at` is the connection-time preparation timestamp, not the exact failure time.

MQTT QoS 1 permits duplicate delivery. MQTT acknowledgements establish transport delivery, not successful physical execution. Applications must deduplicate and reconcile independently. These properties follow the [MQTT 5 standard](https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html).

## Authentication and broker permissions

Require TLS 1.2 or newer with CA and hostname verification; use the deployment's configured TLS endpoint (commonly 8883). Provision a separate credential per bot and bind that identity to the bot UUID and client ID `bot-{bot_id}`. Prefer client certificates where the selected HiveMQ deployment supports them; otherwise use unique high-entropy credentials over TLS and rotate/revoke them individually.

The following is a permission matrix, **not** a HiveMQ configuration file. Configure equivalent topic permissions in the selected HiveMQ product, deny all unspecified permissions, and test them using separate bot credentials. A client ID alone is not authentication.

| Identity | Publish permissions | Subscribe permissions |
| --- | --- | --- |
| Bot X | Exact X topics: `telemetry`, `state`, `events`, `availability`, `acks` | Exact X `commands` |
| Backend ingest | None | `hostelxpress/v1/bots/+/telemetry`, `/state`, `/events`, `/availability`, `/acks` (each is a separate full filter) |
| Backend command publisher | Explicit provisioned bot `commands` topics | None |
| Student app / anonymous | None | None |

Do not give a bot `#`, `+`, another bot's topic, or permission to publish commands. Reject a payload whose `bot_id` differs from the authenticated topic identity. Configure broker payload limits (16 KiB maximum for this contract), connection limits, rate limits, and logs without secrets. Reject retained commands at the broker if the chosen deployment supports that policy.

## Payload validation

Machine-readable payload definitions are in `contracts/mqtt/wire.schema.json` (JSON Schema 2020-12). All timestamps use RFC 3339 UTC, preferably millisecond precision and a `Z` suffix; all identifiers use UUIDs. Enable actual `format` validation in the chosen validator. The server additionally validates topic/payload identity, message size, time bounds, monotonic sequence per boot, and business state; JSON Schema cannot compare timestamps or query order ownership.

Each message has `schema_version:1`, `message_type`, `message_id`, `bot_id`, and `sent_at`. A fresh process boot has a new `boot_id`; telemetry and state use an increasing `sequence` within that boot. Drop stale/out-of-order telemetry. Deduplicate state/events by `(bot_id,message_id)` and validate transitions; an old message must never move a completed or failed order backwards. Do not trust device clocks for deadlines or authorize based only on a claimed sequence.

`telemetry`: battery percentage 0-100; `current_lat` and `current_lng` must both be null when there is no GPS fix, otherwise both must be in range. A sample location is an observation, not proof of hostel arrival. The backend accepts a device arrival event only for the assigned trip/order and verifies the configured arrival conditions agreed with the robotics team.

Phase 1 adds optional safety observations without renaming existing v1 fields. Telemetry may carry `clock_synchronized:boolean` and `compartments:[{compartment,outer_closed,inner_closed,is_empty}]` for at most three distinct compartment IDs (1-3). Each included sensor record requires all three booleans; unknown or omitted data remains unsafe rather than defaulting to closed/empty. Lid/parcel events may include optional `outer_closed`, `inner_closed`, and `is_empty` observations. Backend safety decisions require fresh telemetry and the assignment/command correlation; an event alone cannot manufacture freshness or authorize an unlock.

Critical event and command acknowledgement delivery can use `POST /v1/devices/{bot_id}/messages` with the same canonical raw JSON as MQTT. Provision a separate device HMAC secret. Headers: `X-Device-Timestamp` contains Unix seconds; `X-Device-Signature` is hexadecimal HMAC-SHA256 over `timestamp + '.POST./v1/devices/' + bot_id + '/messages.'` followed by the exact raw body bytes. The server authenticates the path identity and time window before processing, commits inbox and effects atomically, then returns `{stored:true,message_id,duplicate:boolean}`. A persistent device queue is removed only after this application receipt, never on MQTT PUBACK. See `docs/hardware-handoff.md` for the drop-in communication connector.

`state`: one of `IDLE_AT_GATE`, `LOADING`, `TRANSIT`, `AT_HOSTEL`, `UNLOCKED`, `RETURNING`, `FAULT_MODE`. `FAULT_MODE` is the deck's safety exception to the normal lifecycle. Physical stopping and safe-state behavior remain the robotics team's responsibility.

## Unlock request

Example (synthetic UUIDs and timestamps):

```json
{
  "schema_version": 1,
  "message_type": "command",
  "message_id": "00000000-0000-4000-8000-000000000101",
  "bot_id": "00000000-0000-4000-8000-000000000001",
  "sent_at": "2026-10-26T12:00:00Z",
  "issued_at": "2026-10-26T12:00:00Z",
  "expires_at": "2026-10-26T12:00:10Z",
  "order_id": "00000000-0000-4000-8000-000000000201",
  "command": "unlock_inner",
  "compartment": 1
}
```

The deck's `command` and `compartment` fields are preserved. `message_id` is also the durable command ID; do not generate a new ID for a retry of the same command. Only `unlock_outer` and `unlock_inner` are defined in this Phase 0 command schema.

Backend authorization before publishing:

1. Lock and re-read the application order and compartment assignment. Require a fresh, connected bot, closed/interlocked safe lids, no active fault, and the expected lifecycle state.
2. Outer lid: validate a rider OTP through the agreed provider integration, with attempt limits and a five-minute rider deadline. The deck explicitly says the external delivery-platform OTP integration is unconfirmed. Never substitute a successful text entry for provider verification; do not log or publish the OTP.
3. Inner lid: require a verified captured payment for this exact application order, provider payment/QR binding, INR currency, and **1,000 paise** expected amount; require `Arrived`/`Paid` state as appropriate and the correct bot/compartment. Use the server's saved provider IDs. Do not accept only `payment.authorized` or an app callback.
4. Verify `X-Razorpay-Signature` using the exact raw webhook bytes and the webhook secret before parsing/processing; use constant-time comparison. Deduplicate event IDs **and** payment/business effects; handle out-of-order events. Match the provider resource relationship for the selected Dynamic QR product rather than assuming every QR payment has a Razorpay Orders API order ID. These webhook requirements are based on [Razorpay's official validation documentation](https://razorpay.com/docs/webhooks/validate-test/).
5. Commit the payment/order state and a durable pending command before publishing. Database commit and MQTT publish are not atomic. A future transactional outbox or equivalent durable retry mechanism must close that gap before production. The four-table Phase 0 schema is not an implementation of that mechanism.

Replay and delivery rules:

- Use MQTT 5 `Clean Start=true` and `Session Expiry Interval=0` for the bot command connection. Subscribe on every connection with Retain Handling `2` (do not deliver retained values) and Retain As Published `true`; reject any received retained command.
- Backend sets `Message Expiry Interval=10` seconds and payload TTL at most 10 seconds. Check `issued_at <= expires_at`, `expires_at-issued_at <= 10 seconds`, bounded clock skew (2 seconds), and current trusted time before action. A bot without a synchronized clock or reliable deadline check refuses unlock requests.
- Require the topic's bot ID, active order ID, compartment 1-3, local assignment, lifecycle, and lid interlocks to match. Reject an expired, future-dated beyond skew, malformed, retained, wrong-order, wrong-compartment, or fault-state request.
- Persist command identity and decision before attempting actuation. Duplicate IDs return the previous result and never repeat an unlock. If a power loss leaves execution uncertain, fail closed and reconcile lid sensors and server state; never blindly replay.
- `acks` reference `command_id` equal to the request's `message_id`. `accepted` means validated; `executed` means the hardware confirmed the requested operation; `rejected` includes a bounded machine reason. Only subsequent confirmed inner-lid closure completes handover.
- If no application acknowledgement arrives, reconcile the bot and order state before retrying within the same expiry window. An MQTT PUBACK does not authorize a new command ID or mark an order Completed.

HiveMQ supports configurable session and message expiry; choose deployment limits that preserve these bounds. See [HiveMQ broker configuration](https://docs.hivemq.com/hivemq/latest/user-guide/configuration.html). These connection/TTL settings are project decisions, not vendor defaults.

## Timer, dispatch, and evidence semantics

The server owns both independent five-minute deadlines:

- **Rider deadline:** order creation/accepted reservation + five minutes. An unloaded `Pending` reservation expires to `Failed` with `failure_reason=rider_no_show`. A loaded parcel is not canceled as a no-show. A cancellation race and a rider load event must lock the same order/assignment.
- **Load deadline:** the first verified outer-lid loading attempt enters `LOADING` and starts a five-minute batch window. Later riders never reset that window. At three confirmed loaded and locked compartments, mark dispatch eligibility immediately. At expiry, dispatch eligibility requires at least one loaded parcel and all lids closed. Cancel only unloaded reservations whose own rider deadline has expired. An unloaded reservation with time remaining must be detached/requeued or reassigned, preserving its original rider deadline, after confirming its compartment is empty and secure; departure never shortens a rider's five-minute allowance. Lock the bot row and affected orders in a consistent order, then transition atomically. If no parcel was loaded, remain/return idle without dispatch and cancel only eligible overdue reservations. Never send an empty bot or depart with a lid open. Route execution belongs to robotics.

A `Failed` order can still contain a physical parcel. Terminal order status alone must never make its compartment available. Release the reservation only when `compartment_released_at` records confirmed safe physical removal/closure (or a documented operator reconciliation). All reservation and dispatch queries must respect that physical release marker.

The backend calculates these conditions; telemetry never bypasses them. No timer worker is implemented in Phase 0.

The robotics adapter maintains a rolling camera buffer through transit and retains it until the handover outcome. A normal cleanup requires captured payment **and a correlated inner-lid-closed event** for that order. A fault (forced lid, collision, stuck bot, or server-observed payment failure) preserves the last **120 seconds** for private upload and an admin alert. No automatic cleanup occurs while a fault is unresolved. Multi-order footage must not be erased while another covered handover is unresolved.

The `camera_evidence_uploaded` event reports an `incident_id`, private object key `incidents/{bot_id}/{incident_id}/{clip_name}.mp4` (or `.h264`), and SHA-256. The backend requires the key to match the server-authorized bot/incident upload target, verifies the object exists using its storage identity, records an incident linkage, and applies storage access/retention rules. An object key is not proof of successful upload. The actual camera control/evidence request protocol, storage provider, incident persistence/outbox, and retry policy require implementation in the approved backend integration phase; this schema defines result events only.

Keep unsent critical events in a durable device queue across reconnects, reusing their message IDs. The backend ingest subscription needs a persistent session and bounded expiry configured independently from the bot's deliberately nonpersistent command session. An application-level receipt/reconciliation path must establish that critical events were durably stored; a broker PUBACK alone does not prove this. Design and test that retry path in the backend integration phase.

## Integration acceptance checklist for the next phase

- Bot X cannot publish/subscribe to Bot Y or publish any command.
- Anonymous and student app credentials cannot connect to MQTT.
- Captured payment retry, out-of-order webhook, reconnect, expired command, and duplicate QoS 1 delivery never cause a second unlock.
- Cross-order payment, wrong amount/currency, unsupported payment state, forged arrival, and wrong compartment are rejected.
- A five-minute rider timeout race releases only the unloaded reservation; concurrent reservations cannot share a compartment.
- Bot offline, stale heartbeat, unknown clock, fault, open outer lid, or missing execution acknowledgement leaves the inner lid locked and order unresolved.
- Closed-lid success cleans only eligible footage; failure preserves 120 seconds and a verified private upload reference.

These are planned integration checks, not claims of tests already executed.

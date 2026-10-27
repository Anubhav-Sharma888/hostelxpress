# Phase 1 HTTP contract

Application/backend phase approved after Phase 0. These agreed frontend/backend shapes are the integration contract; FastAPI `/openapi.json` is the executable route/model reference once the service is running. All development and verification take place in the canonical Ubuntu checkout `/home/anubhav_sharma_888/src/hostelxpress`.

## Transport and identities

Local review uses a loopback-bound API and explicitly labeled demo mode. Real deployments require HTTPS. Every `/v1/` student route requires `Authorization: Bearer <access_token>`. The server derives the user from the validated token; client-supplied `user_id`, `bot_id`, compartment, amount, payment state, or lifecycle status never establish authority.

Demo sessions and state controls exist only when `APP_ENV=demo`. They must be refused in other modes and cannot be used with real payment/device integrations. Loopback access is required for demo login/control; forwarded headers are not a substitute for a trusted network peer. The application shows a persistent demo label, fixture hostels, simulated location, and nonpayable payment data.

Use JSON bodies (`Content-Type: application/json`). IDs are UUID strings and timestamps are RFC 3339 UTC. Amounts are integer paise: `1000` and `INR` mean the INR 10 delivery fee. UUID examples below are placeholders rather than device enrollment.

## Routes

| Method and path | Request | Success body |
| --- | --- | --- |
| `POST /auth/demo` | `{name, hostel_block}` | Demo session below |
| `GET /v1/me` | None | `User` |
| `PATCH /v1/me` | Editable profile fields only (`name`, `hostel_block`) | `User` |
| `GET /v1/orders` | None | `{items: Order[]}` |
| `POST /v1/orders` | `{destination_hostel_block, parcel_label?}` and UUID `Idempotency-Key` header | `Order` |
| `GET /v1/orders/{id}` | None | Owned `Order` |
| `GET /v1/orders/{id}/events` | None | `{items: TimelineEvent[]}` |
| `GET /v1/bots/{id}` | None | `Bot`, only for an active assigned order |
| `POST /v1/orders/{id}/payment` | No financial amount or payment-success assertion from the app | `Payment` |
| `POST /v1/demo/orders/{id}/advance` | `{action}` with the enum below | Owned `Order` |

Authenticated routes return `401` for missing, expired, forged, or wrong-mode sessions. Cross-owner IDs return `404` to avoid disclosing another student's order. Invalid state/capacity/idempotency conflicts use `409`; malformed inputs use `422`. Errors use FastAPI's `detail` field; the UI accepts a string or validation array and presents a useful human message. Operational failures must not expose database connection strings, token contents, webhook secrets, or internal tracebacks.

### Demo session

```json
{
  "access_token": "opaque-demo-session-token",
  "token_type": "bearer",
  "expires_in": 3600,
  "mode": "demo",
  "user": {
    "id": "00000000-0000-4000-8000-000000000901",
    "name": "Anubhav",
    "hostel_block": "C"
  }
}
```

`expires_in` is an integer count of seconds, not a promised fixed lifetime. Name and hostel are editable. Demo hostels A-G are explicitly fixtures, not asserted campus names. Each demo identity receives its own server-assigned user UUID; the UI never selects an existing user's UUID as a login mechanism.

### User

```json
{
  "id": "00000000-0000-4000-8000-000000000901",
  "name": "Anubhav",
  "hostel_block": "C"
}
```

User profile changes do not alter an existing order's destination snapshot. Credentials are never returned as `User.auth_token`.

### Bot

```json
{
  "id": "00000000-0000-4000-8000-000000000001",
  "status": "LOADING",
  "battery_level": 86.0,
  "current_lat": null,
  "current_lng": null,
  "last_seen_at": "2026-10-27T08:00:00Z",
  "load_deadline_at": "2026-10-27T08:05:00Z"
}
```

`last_seen_at`, `load_deadline_at`, battery, and coordinates may be null. GPS is either both null or a valid latitude/longitude pair. Bot status uses the Phase 0 state enum including `FAULT_MODE`. Availability and observation age must be shown honestly: a stored coordinate is not fresh tracking. An order awaiting allocation can have `bot:null` and `compartment_id:null`. History must not grant live bot tracking after the student's active assignment ends; an archived snapshot or null bot is appropriate.

### Order

```json
{
  "id": "00000000-0000-4000-8000-000000000201",
  "status": "Pending",
  "destination_hostel_block": "C",
  "parcel_label": "Dinner delivery",
  "amount": 1000,
  "currency": "INR",
  "created_at": "2026-10-27T08:00:00Z",
  "rider_due_at": "2026-10-27T08:05:00Z",
  "compartment_id": 1,
  "bot": null,
  "timeline": [
    {"status": "Pending", "at": "2026-10-27T08:00:00Z"}
  ],
  "payment_status": null
}
```

The required shared fields are those shown above. Responses may additionally include `user_id`, `bot_id`, `updated_at`, `loaded_at`, `arrived_at`, `paid_at`, `completed_at`, `failure_reason`, and `is_demo`. A timeline event may include its own `id`; `status` and `at` remain stable. The illustrative null bot does not require an assigned bot's public details to be returned before they are authorized.

Order statuses are exactly `Pending`, `Loaded`, `Transit`, `Arrived`, `Paid`, `Completed`, `Failed`. `payment_status` is `Pending`, `Authorized`, `Captured`, `Failed`, `Refunded`, or null. A payment's authorized state is not captured payment and cannot unlock collection. `Failed` does not imply an occupied compartment is reusable.

`parcel_label` is optional and at most 120 characters. The server validates the destination's length only today; the authorized hostel set is an integration input and is not enforced yet. The server assigns the bot/compartment. `Idempotency-Key` is a required UUID header on order creation: retries for the same user/key/body return the existing result; reusing that key with a different body conflicts. A key from a different user cannot retrieve the first user's order.

### Payment

```json
{
  "order_id": "00000000-0000-4000-8000-000000000201",
  "amount": 1000,
  "currency": "INR",
  "provider": "demo",
  "status": "pending",
  "qr_image_url": null,
  "qr_payload": "HOSTELXPRESS_DEMO_NONPAYABLE:00000000-0000-4000-8000-000000000201",
  "expires_at": null
}
```

`provider` is `demo` or `razorpay`; the provider is chosen on the server. `status` is the payment-screen summary `pending` or `paid`, distinct from the canonical transaction status on an order. `qr_image_url`, `qr_payload`, and `expires_at` are nullable. The response may additionally include `qr_id` and `is_demo`.

A demo QR contains no `upi://` URI, real payee, account, or payment link. It must display "Demo - no money moves". A real QR is created by the backend for exactly 1,000 paise, fixed amount and single use; no client-provided amount overrides it. An unpaid order must be in an eligible arrival state before a payment request is created. Repeated requests reuse the pending eligible payment attempt rather than issuing uncontrolled duplicate QRs.

The frontend never sets `Paid` or opens a lid after a checkout callback. Verified provider capture and correct QR/order/currency/amount association establish the payment. A durable command waits for a correlated hardware acknowledgement; the order completes only after confirmed inner-lid closure.

### Demo advance

`action` is exactly one of `load`, `dispatch`, `arrive`, `pay`, `close_lid`.

| Action | Simulated server-side effect |
| --- | --- |
| `load` | Verify demo rider/loading conditions; confirm loaded/locked parcel and enter loading state |
| `dispatch` | Make the bot eligible after three secure parcels or **explicitly advance demo virtual time to its five-minute load deadline** |
| `arrive` | Generate an authenticated demo arrival for the assigned trip; no physical route is run |
| `pay` | Generate a synthetic verified capture through the same business path and durable outbox used by the demo backend |
| `close_lid` | Generate correlated demo hardware execution/closure; complete collection and release only when safe |

These controls operate only on the caller's owned order in demo mode and appear as simulator controls rather than student production actions. The client does not progress the lifecycle on a timer or set status directly. Retry/invalid-order/state requests must be safe. The five-minute rider window remains independent; departure must preserve any later rider's unexpired deadline as defined in `docs/mqtt-contract.md`.

## Official implementation references

- [FastAPI bearer token dependencies](https://fastapi.tiangolo.com/tutorial/security/first-steps/) extract credentials; the application must still validate identity and authorization.
- [FastAPI CORS](https://fastapi.tiangolo.com/tutorial/cors/) describes origin handling. Use an explicit development-origin allowlist; CORS is not authentication or protection against direct HTTP clients.
- [Expo environment variables](https://docs.expo.dev/guides/environment-variables/) are embedded in client bundles for `EXPO_PUBLIC_*`; expose only nonsecret configuration such as the API base URL.
- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/) supports native secret storage. Web demo sessions can remain in memory; do not assume this native module supplies browser storage.
- [Razorpay webhook validation](https://razorpay.com/docs/webhooks/validate-test/) requires raw-body verification and duplicate/out-of-order handling. [QR creation](https://razorpay.com/docs/api/qr-codes/create/) documents fixed amount and single use; real merchant capability must be verified separately.

# Rider OTP and Razorpay integration checkpoint

Status: **HostelXpress-owned rider OTP issuance and signed-device redemption
implemented in a feature branch**. Do NOT enable on the current restricted
Supabase/Render staging service. No live carrier OTP, payment or rover unlock
is claimed.

## Design

The rider uses a Gate 2 code to authorize the **outer** lid before loading.
Only independently verified ₹10 (1000 paise) Razorpay capture may authorize
the **inner** lid after Arrived. Student app actions never prove physical
opening or collection; the rover must report signed acknowledgements and
fresh closure/empty telemetry. A carrier's separate OTP is NOT verified by
a HostelXpress-owned code; third-party carrier verification requires an
approved provider API.

## Operator issuance

The feature is disabled unless the server has both independently generated,
32+ character **RIDER_OTP_SECRET** and **GATE_OPERATOR_TOKEN**. Never put either
in GitHub, client APKs, logs, or screenshots. Keys cannot coexist with
STAGING_BOOKING_USER_ID and must not be used in demo mode.

POST /v1/operator/orders/{order_id}/rider-otp requires X-Gate-Operator-Key.
It returns the one-time six-digit code over HTTPS with no-cache headers to
an authorized Gate 2 operator for manual handoff. It does not send SMS or
WhatsApp and does not impersonate external courier systems. Duplicate issuance
is rejected; no new code resets the guessing counter.

The issuing server first locks bot/order, checks Pending assignment,
original rider deadline, authenticated clock, fresh telemetry and a closed
empty compartment. It stores only an HMAC digest (not the raw code) with a
five-minute maximum expiry.

## Signed device redemption

POST /v1/devices/{bot_id}/rider-otp requires HMAC signature headers
X-Device-Timestamp and X-Device-Signature over the exact request bytes.
Body: {"order_id":"<uuid>","compartment":2,"code":"000000"}.
The credential must belong to that rover; student JWTs cannot use the route.

The server checks order/bot/bay binding, current order and sensor safety,
then reads the challenge under a database row lock. Wrong guesses are
persisted (maximum three attempts), including when HTTP returns 403.
A correct code is consumed in the **same transaction** that queues at most
one ten-second unlock_outer command in the existing outbox. It does not
publish MQTT, move a servo, change order status or claim physical success.
The device must separately accept the command and report actual events.
Expired, duplicated, forged or mismatched submissions fail closed.

Migration: supabase/migrations/0004_rider_otp_challenges.sql. The table is
in the unexposed private schema with RLS and no anon/authenticated grants.
The disposable GitHub PostgreSQL tests apply this migration automatically;
the connected Supabase project has not been modified. Any production
database role must be separately reviewed for required least privilege.

## Existing payment controls

Payment QR is single-use, fixed-amount ₹10 and bound to the saved order.
The existing backend verifies provider webhook signature on raw bytes,
fetches the actual payment from Razorpay, checks captured state/amount/INR
and QR association, deduplicates events, and queues guarded unlock_inner.
Razorpay TEST mode account eligibility and real webhook delivery still need
external verification. Live payments require merchant activation and may
incur processing charges; none are initiated here.

## Remaining work

Secure operator experience and code delivery, provider OTP integration if
external courier-issued codes are required, auditing/rotation/reconciliation,
real enrolled rover plus MQTT ACLs, Razorpay sandbox QR/webhook acceptance,
and Android test UI. Keep physical rover implementation with robotics team.


## Payment-state recovery after app restart

An authenticated student can now GET /v1/orders/{order_id}/payment.
This endpoint is **read only**: it checks ownership and returns 404 if no
payment attempt exists, without requesting a new QR or calling Razorpay.
A saved pending QR is restored when reopening an Arrived delivery; creation
uncertainty is explicitly 'reconciling' with no payable QR; failed and
refunded attempts never display a QR. Only pending QR codes can expire in
the mobile presentation: a previously captured payment cannot revert to
'QR expired'. The student contacts support for expired or uncertain cases;
retrying a QR after a lost network response is deliberately prohibited.
The active staging API remains unchanged and its test-only payment route is
disabled without broadening Supabase access.


## Read-only Razorpay TEST-key readiness probe

Run this before enabling any hosted payment feature. It does **not** connect
to Supabase, mutate Render, generate a QR, capture a payment, trigger a webhook,
or perform an actual transaction.

From the repository root with the Linux Python environment activated:

```bash
PYTHONPATH=services/api python3 -m app.razorpay_readiness
```

Make `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and optionally
`RAZORPAY_WEBHOOK_SECRET` available to that process using an approved
local secret manager or private environment; do not pass actual credentials
as command-line flags, paste them into ChatGPT, add them to GitHub, or place
them in the Android app. The readiness probe refuses keys without the
`rzp_test_` prefix **without making any request**. Its sole outbound
operation is `GET /v1/payments/qr_codes?count=1` over HTTPS with HTTP Basic
Auth. The printed JSON contains only fixed booleans/status codes:
`qr_read_api_ok`, `authentication_rejected`,
`forbidden_or_product_not_enabled`, `provider_rate_limited`,
`network_or_tls_error`, etc. It never prints the key, secret or provider
response body.

**Passing GET is not proof that QR creation is allowed.** Razorpay documents
`upi_qr` as an on-demand feature and QR/UPI-intent payment testing may be
restricted to Live mode. Do not scan a provider QR with a real UPI app while
claiming that no money can move. In the current review branch, payment
webhook tests are replayed against a fake provider and disposable PostgreSQL.
End-to-end Razorpay integration must be verified in a separately authorized
payment-test deployment after product capability is confirmed.

## TEST-only server guard

A separate, explicitly approved Razorpay sandbox pilot should set
`RAZORPAY_TEST_ONLY=true`. Backend startup will refuse partial merchant
credentials, any non-`rzp_test_` key, demo mode, or the existing restricted
staging-booking environment. This is a safety guard, **not** permission to
enable payments on the current free Render staging service.

Before any operator-facing payment rollout, confirm the Test-mode QR
product is actually available for the merchant, register a distinct
TEST webhook secret, prove signatures with a real test webhook,
confirm event/idempotency behavior, and obtain approval for real QR/UPI
transactions. The safety/financial boundary remains: captured payment
can authorize a *queued* inner-lid command, not prove physical actuation.

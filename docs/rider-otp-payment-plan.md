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

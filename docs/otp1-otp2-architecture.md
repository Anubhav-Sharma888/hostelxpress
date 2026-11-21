# HostelXpress OTP 1 and OTP 2 — confirmed architecture

This document supersedes the old Gate 2 rider-OTP plan. These are separate codes with different issuers, purposes and access controls.

## OTP 1 — courier-platform code, display only

The student receives a code from Amazon, Flipkart or another delivery company and sends the 4–8 digit code through the authenticated HostelXpress app while the order is Pending with an assigned rover. HostelXpress does not generate, verify or validate this code against the courier.

The backend encrypts the code in an unexposed private database table for at most five minutes and no later than the original loading deadline. Only the assigned, HMAC-signed rover may retrieve it once. The rover must show the code briefly to the courier, promptly clear the screen, and never log, persist or broadcast it. A lost response requires operator reconciliation.

OTP 1 MUST NEVER open either lid, prove courier identity or authorize payment. A separate authenticated gate-staff action queues the outer loading command subject to fresh safety telemetry and a closed empty compartment. Actual execution and loaded-parcel observations remain distinct.

Student API: POST /v1/orders/{id}/courier-code with a code body.
Rover API: POST /v1/devices/{bot_id}/courier-code/display using signed bot identity.
Gate staff API: POST /v1/operator/orders/{id}/loading-open with X-Gate-Operator-Key.

## OTP 2 — HostelXpress student pickup code

Only after signed rover arrival and a captured ₹10 (1000 paise, INR) Razorpay payment does the authenticated student become eligible for OTP 2. The app offers a Generate pickup OTP 2 control while the order status is Paid.

The backend generates a six-digit cryptographically random code, stores a keyed HMAC digest and AES-GCM ciphertext bound to the original order, rover and bay, and enforces a five-minute validity, three wrong attempts, single use and no automatic reset or reissue. The owner can retrieve the SAME live code after reopening the app; other students cannot read it.

The student types OTP 2 into the assigned rover's keypad. That rover sends a signed HTTP request to the backend. The backend independently confirms payment capture, current Paid order, assignment and bay, recent synchronized and safe telemetry, closed lids, loaded parcel and the unused OTP2.

Only then does ONE transaction consume OTP2 and enqueue a single unlock_inner command for the assigned compartment. Payment alone cannot enqueue an inner command. The HTTP receipt queued_not_executed is not physical evidence. Signed execution ACK and fresh empty, closed bay events are still needed before marking delivery Completed.

Student APIs: POST /v1/orders/{id}/pickup-otp (issue), GET the same path (recover).
Rover API: POST /v1/devices/{bot_id}/pickup-otp using signed device identity.

## Safety, keys, deployment

Backend-only PICKUP_OTP_SECRET must be 32+ bytes. Purpose-separated AES-GCM encryption protects OTP1 and OTP2; never put secrets or code contents in logs, repositories, APKs, screenshots or analytics. Independent GATE_OPERATOR_TOKEN is 32+ characters for supervised Gate 2 outer loading. Both are disabled in demo and the current restricted staging-booking service.

Private migration: supabase/migrations/0004_pickup_and_courier.sql, with RLS and no anon/authenticated table grants.

Rover connector functions: link.pull_courier_code(order_id, bay) for a display-only OTP1, and link.submit_pickup_otp(order_id, bay, entered_code) for OTP2. Neither invokes hardware directly.

Connected Supabase currently has 0001–0003 migrations and no enrolled non-demo rover. No new migration has been applied. Razorpay TEST authentication and QR listing worked but test QR creation was rejected; simulated tests are NOT evidence of real QR payments, webhook delivery or hardware actuation. The existing published staging APK and live API remain untouched.

Before a real trial: supervised gate-staff setup, secure backend keys, rover-screen wiring and local physical safety guards, signed device and MQTT reconciliation, QR account capability/merchant activation, an explicitly authorized financial test, and a separately approved release.

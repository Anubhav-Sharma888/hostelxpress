# Gate 2 rider OTP and Razorpay: software implementation boundary

Status: OTP **security primitives completed**, full provider/delivery/DB/API
integration **NOT yet connected**. No live payment or physical unlock is enabled.

## Existing contract (do not change)

- The rider presents an OTP before loading through the **outer** lid.
- The student pays **₹10 (1000 INR paise)** via Razorpay only **after Arrived**.
- Verified captured payment *may queue* an **inner** unlock, never mark physical
  execution or collection. The rover acknowledges actual actuation and later
  reports a fresh empty, closed compartment.
- Staging test bookings with no rover cannot progress past Pending.
- Third-party courier/delivery-platform OTPs are **not** verifiable without
  the respective provider's approved integration. The new helper issues only
  **HostelXpress-owned** codes; it does not authenticate third-party codes.

## Implemented in this checkpoint

The isolated \`services/api/app/rider_otp.py\` offers cryptographically random
6-digit codes, keyed HMAC digests (never store raw codes), order/bot/bay binding,
expiration no later than the five-minute rider loading deadline, three attempts,
single use and replay rejection. This is a pure component, with tests that do
not send SMS, publish MQTT or call Razorpay. The caller must atomically persist
each transition (including failed attempts) in a private database table.

## Still required BEFORE attaching an OTP route or unlocking any rover

1. Confirm the source and approved delivery channel for the rider's OTP:
   HostelXpress-generated (and whether received by rider, student, or gate staff)
   vs a third-party courier-platform OTP. Do **not** impersonate the latter.
2. Create a versioned migration using the repository's Supabase CLI workflow for
   a private per-order OTP challenge table. Keep RLS enabled, deny anon and
   authenticated roles, grant only the server role as required. Add atomic
   \`SELECT FOR UPDATE\` redemption with persisted attempt counts and consumed_at.
3. Secure issuance by a trusted authenticated actor, and redemption by a
   signed bot/device or authenticated gate staff. A student token must never
   directly unlock a physical lid. Never return code hashes or secrets to apps.
4. Require order Pending, same bot/bay, rider deadline, fresh synchronized
   telemetry, no fault, a secure target bay and sufficient separation of
   duties; then enqueue at most one correlated \`unlock_outer\` command in the
   existing command_outbox. Only the device confirms physical execution.
5. Test lost HTTP replies, duplicate submits, concurrent guesses, expiry,
   clock errors, unauthorized issuer, cross-order reuse, and stale telemetry
   against a disposable PostgreSQL instance and the existing connector.
6. Keep \`RIDER_OTP_SECRET\` separate from Supabase/JWT/Razorpay keys, generate
   it with a cryptographically secure generator, store only server-side,
   and leave the feature disabled unless a real delivery channel is configured.

## Payment checkpoints

The existing \`payments.py\` has: single-use, fixed-price UPI QR, durable
creation intent, raw-body HMAC webhook validation, provider-side QR/payment
association confirmation, amount/currency checks, event-ID deduplication, and
a guarded command outbox. Preserve these. Check actual Razorpay QR eligibility
and webhook delivery in TEST mode; an API 400 is not proof of working checkout.
QR scanning that collects actual money requires merchant/QR activation.

Never put merchant keys, OTP codes, database passwords, or private bot signing
credentials in GitHub, APK bundles, screenshots, app analytics, or logs.

Next operator stage: test-mode OTP issuer and secure redemption integration in
disposable PostgreSQL; Razorpay test-mode callback and replay/late-payment
acceptance tests; then mobile screen wiring and phone QA. No live charge.

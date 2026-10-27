# Phase 1 application integration and acceptance

This phase implements the student application and backend foundation following explicit Phase 0 approval. Linux remains the development platform. Gazebo, ROS, navigation, firmware, motor control, servo implementation, and route planning are outside the application team's scope.

## Integration boundary

The review target is an Expo React Native application with a web preview backed by FastAPI and PostgreSQL. A clearly marked local demo supports an actual API/database journey without merchant credentials or a physical bot. The demo exercises server decisions rather than client-only screen changes. It does not establish a real Supabase, payment-provider, MQTT-broker, camera-storage, or hardware integration.

The agreed student API is documented in `contracts/http/openapi-notes.md`. The existing MQTT topic/wire contract remains authoritative for the hardware interface. Native Android packaging and platform behavior need device validation; a successful web preview does not establish a tested Android build.

## Configuration and identity rules

- Use the Linux checkout `/home/anubhav_sharma_888/src/hostelxpress`; source `.tools/env.sh` before installing dependencies or running checks.
- Demo server configuration is explicit (`APP_ENV=demo`) and bound to loopback. Session issuance and demo state controls refuse nonlocal callers and are unavailable outside demo mode. Do not expose the demo API through a tunnel or public listener.
- Real mode must use provider-validated user identity. It cannot accept demo tokens or silently fall back to demo when cloud configuration is incomplete. Missing required credentials/configuration fails closed with a useful operator message.
- Demo and real database/integration targets are kept separate. Demo controls never publish physical unlocks or create chargeable payment requests.
- Never add database URLs with passwords, service-role tokens, Razorpay secrets, MQTT credentials, or device keys to `EXPO_PUBLIC_*`, source bundles, screenshots, committed environment files, or logs.
- The browser demo uses an in-memory session; a refresh may require demo sign-in again. Native persistent authentication requires a supported secure storage strategy and separately tested logout/expiry behavior.

## Review journey

1. Enter an editable name and demo hostel; see the persistent demo label.
2. Book a parcel to the selected fixture hostel. The app sends an idempotency key, then displays the server-returned reservation, fee, compartment, and rider deadline.
3. Follow loading and transit in a clear status timeline. Fixture coordinates and any schematic route are visibly simulated; they are not campus navigation or a promised ETA.
4. Use labeled simulator controls to load, advance the five-minute load window, and arrive. Each action calls the backend; refreshing the data preserves the database lifecycle.
5. At arrival, open the payment screen. The QR is visibly nonpayable. A separately labeled simulated capture updates the server's payment state and durable unlock request.
6. Until execution/closure confirmation, the app shows collection pending. Simulated lid closure completes the handover and history entry.
7. Review history/profile/help, then sign out. A different demo identity cannot inspect or progress the previous student's order.

## Acceptance and test ownership

| Area | Meaningful acceptance evidence |
| --- | --- |
| Authentication | Missing, malformed, forged, expired, and wrong-mode tokens fail; demo login does not accept an arbitrary user UUID |
| Demo isolation | Nonlocal login/advance requests fail; non-demo mode does not expose demo controls; real integrations cannot be selected by a demo request |
| Ownership | User B cannot list, inspect, pay, advance, or read events for user A's order; stale completed assignments do not expose live bot telemetry |
| Profile | Only display name/hostel can change; existing order destination stays fixed; user ID/role/token fields cannot be set |
| Idempotency | Booking retry creates one order; same key/different body conflicts; key scope cannot cross users |
| Reservations | Concurrent users cannot occupy the same unreleased compartment; failure does not free physical custody |
| Timers | Rider and batch deadlines are independent; one loaded parcel waits until load deadline, three secured parcels are eligible immediately, empty/open-lid/faulted bot cannot depart; a later rider is requeued without losing time |
| Payment | Server fixes INR 1,000 paise, validates capture and QR/order binding, rejects wrong amount/currency/provider resource, and never trusts app success callbacks |
| Webhook durability | Raw-body signature verified before effects; duplicates and changed event IDs for the same payment do not generate another charge-state effect/unlock; failure/out-of-order events cannot roll captured state backward |
| MQTT/outbox | Capture and pending command are atomic in the database; publish failure leaves retryable durable state; expiry/correlation prevents stale commands and duplicate actuation |
| Handover | Only correlated hardware closure after captured payment completes an order; a PUBACK or app button alone is insufficient |
| UI | Loading/empty/offline/error/stale-tracking/payment-pending/collection-pending states are readable; primary controls prevent accidental double submission; status text and spacing remain usable at narrow mobile widths |
| Platform | TypeScript/build/export checks and browser journey pass; native Android/iOS checks are listed separately with their actual observed status |

The backend author owns the vertical API/database tests. Independent security review owns `services/api/tests/test_security_qa.py`; the integrating agent owns browser/end-to-end verification. These are acceptance requirements, not a claim that every test has already passed. Record observed results and remaining external integration work in the final phase review.

## Current external dependencies

Real hostel names, arrival conditions, device identities, merchant QR capability, and delivery-platform OTP verification still require the relevant team/provider inputs. The supplied architecture explicitly leaves OTP integration unconfirmed. No fake OTP validation, fabricated campus route, or real payment address is substituted.

Real Supabase Auth/API, HiveMQ ACL/TLS, Razorpay sandbox, private incident video storage, and physical lid/interlock behavior must each be validated against the actual configured environment before a production pilot. This phase's local demo and fixture database do not replace those checks.

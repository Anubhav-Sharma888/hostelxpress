# Android device QA checklist

For the debug APK built in Phase 3 (`apps/student/android/app/build/outputs/apk/debug/app-debug.apk`). A debug build talks to whichever `EXPO_PUBLIC_API_URL` was set at build time; a device cannot reach the laptop's `localhost` — use the laptop's LAN IP (e.g. `http://192.168.x.x:8010`) and rebuild, or test sign-in against the live Supabase project with the backend reachable on your network.

## Install

1. Copy the APK to the phone (USB/Drive) and open it; accept the unknown-sources prompt (debug builds are not Play-signed).
2. Confirm the app launches to the sign-in screen and the correct mode shows (real: email/password; demo only when built without the Supabase env).

## Core journey (real mode)

- [ ] Sign up with a fresh email; lands on the workspace; name and hostel shown correctly
- [ ] Sign out; sign back in with the same credentials
- [ ] Wrong password shows a readable error, not a crash
- [ ] Book a delivery (requires a reachable backend with bookable bot fixtures); compartment and fee shown
- [ ] Tracking updates while the app is open; stale-device indicator appears when telemetry ages
- [ ] Payment screen shows the server-issued QR state; payment-failed and unlock-pending wording read correctly

## States and resilience

- [ ] Airplane mode: offline notice with retry, recovers when the network returns
- [ ] Kill and reopen the app mid-session: returns to sign-in (sessions are intentionally in-memory)
- [ ] Rotate the device during booking and tracking: no layout break, no state loss
- [ ] Background and foreground the app: polling resumes without duplicate requests
- [ ] Slow 3G (developer options network throttle): timeouts show the friendly message

## Accessibility

- [ ] TalkBack: every button/field announces a sensible label; the hostel picker announces selected state
- [ ] Font size at maximum: all screens remain readable, no clipped text
- [ ] Remove animations enabled: booking modal appears without fade

## Known deferred items (do not fail the build for these)

- Real payment capture (Razorpay activation pending) and physical unlock — demo/wording only
- Real hostel names, OTP-based rider flow, campus routes — external inputs pending
- Report anything unexpected with a screenshot and the app version to the phase review.

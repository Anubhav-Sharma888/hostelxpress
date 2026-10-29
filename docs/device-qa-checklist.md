# Android device QA checklist

Use a freshly built standalone **local QA release** from the current source:

```bash
source .tools/env.sh
bash scripts/build_android_apk.sh release --local-qa
```

The script prints the actual artifact size/hash and verifies its signature and bundled JavaScript. The output is `apps/student/android/app/build/outputs/apk/release/app-release.apk`, signed with the Expo template's Android Debug key. It is a tester build, not a store release. The current artifact record is below; do not substitute an earlier APK based only on the filename. See [Android build procedure](android-build.md).

**No APK has been installed or launched on a physical device in this checkpoint.** A bundle and manifest inspection establish packaging/configuration only.

## Artifact record

The earlier 29 October 2026 artifacts are historical: debug was 250,462,921 bytes, SHA-256 `7df43f7ac371658a58529d2414409c327cd156df7345b6f9fad5e82057c03f84`; the earlier standalone release was 98,449,818 bytes, SHA-256 `278db9d19b1563add4c3cbacbf1096ad12bb5ed36aa2eb8b5ac3b6de35bc1aca`. That release lacked an explicit localhost cleartext exception and is superseded for local-backend QA. The historical debug artifact requires Metro. These hashes do not describe a rebuild containing the new tracked network policy.

Current-source local QA release rebuild: pending; record its actual size/hash and packaged policy after completion.

## Install and connect the backend

1. Copy the freshly verified APK to the phone and open it; accept the unknown-sources prompt. It is debug signed.
2. Enable developer mode and USB debugging. With the phone visible to the SDK's `adb`, run `adb reverse tcp:8000 tcp:8000`. Ensure the ADB host itself reaches the backend's port 8000 (including WSL forwarding where applicable), then start the production-mode backend using its operational guide.
3. The build uses `EXPO_PUBLIC_API_URL=http://localhost:8000`. The explicit `--local-qa` policy allows cleartext only to exact `localhost`; USB reverse forwards that connection to the host. Other domains still require TLS.
4. Confirm the app launches to real email/password sign-in. Real mode requires publishable Supabase URL/key settings when bundling; verify the chosen mode from the screen. Supabase needs internet access, while booking/tracking also require a reachable backend.

**Wi-Fi without USB:** local QA does not permit a LAN HTTP API. Use an approved HTTPS backend and rebuild with its HTTPS `EXPO_PUBLIC_API_URL` without `--local-qa`; configure the backend's `TRUSTED_HOSTS` accordingly. Browser CORS configuration does not authorize native transport. The demo backend intentionally refuses non-loopback callers, so it has no supported LAN demo route. Deployment is separate work.

## Debug builds and Metro

`bash scripts/build_android_apk.sh debug --local-qa` produces a developer APK that normally contains no bundled JavaScript. It requires Metro: in `apps/student`, run `npm start`, add `adb reverse tcp:8081 tcp:8081`, and launch the app with both reverse rules active. Without Metro it cannot load the app. A standalone release bundles JavaScript and does not require Metro, though the host backend is still needed for local API requests.

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
- A signup that requires email confirmation now preserves name/hostel as Supabase user metadata and offers them on first sign-in; that path is unit-tested but was never exercised on a live account — verify it if confirmation gets re-enabled
- Report anything unexpected with a screenshot and the app version to the phase review.

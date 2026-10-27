# Phase 3 plan: complete mobile screen coverage, accessibility, device QA, and polish

Authorized by the user on 28 October 2026. Build on the Phase 1 app foundation and the Phase 2 live configuration. Zero-cost constraint applies throughout.

## Headline: real authentication in the student app

The backend already verifies Supabase ES256/RS256 JWTs against the live project's JWKS, and the project is configured. Phase 3 wires the student app to it:

- Sign-up and sign-in screens (email + password via `supabase-js`) using **only** the publishable key, inlined as `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (public by design; the secret key never enters the app).
- Session: access token held in memory per the existing design, refreshed by supabase-js; sign-out and expiry return the user to sign-in.
- First sign-in lands on profile completion (name + hostel block) via the existing `PATCH /v1/me`; the API base URL points at the production backend when `APP_ENV` is not demo.
- Demo mode remains the local-development path (`scripts/run_demo.sh`); real mode is selected by configuration, never silently.
- The deferred Phase 2 item (real-token end-to-end test) completed as part of this work: sign up → sign in → book → track on the live backend.

**Increment 1 record (28 October 2026, reviewer-approved):** real sign-in/up shipped — `@supabase/supabase-js` with in-memory sessions only, real sign-in screen variant, demo-label gating in every screen, backend `PATCH /v1/me` upsert for real JWT users (with the partial-PATCH clobber fix from QA), ES256 token leeway for VM clock drift, and a rejection log that never records tokens or claims. Verified live: sign-up → profile → sign-out → sign-in on the production backend against the real project. Reviewer-tracked follow-up for the screen-coverage increment: if email confirmation is ever re-enabled, a user confirming later lands without a completed profile and profile.tsx is read-only — add first-sign-in profile completion (when `hostel_block` is null) or a profile-edit affordance.

## Screen-state coverage matrix

Every screen must be readable in all of these states before the phase is called complete (per the Phase 1 acceptance table): loading skeleton, empty (no deliveries yet), offline/retry, server error, stale tracking (device freshness indicator already exists), payment-pending, payment-failed, delayed-unlock, collection-pending. Audit each screen, fill gaps, and cover the states with component tests where practical.

## Accessibility pass

Accessible names and roles on every interactive element, logical focus order, contrast-checked color pairs, minimum touch targets, reduced-motion respect, and usable layout at narrow widths and large font scales. Verified with the existing Playwright journeys plus explicit assertions (accessible names are already asserted there — extend the pattern).

## Android device QA

1. Build an installable debug APK **locally in WSL** (JDK 17 + Android SDK command-line tools + Gradle — all free, no account, no card). EAS Build's free tier is the fallback if local tooling is blocked.
2. The user installs it on a physical Android phone over local network; a written device-QA checklist covers sign-in, booking, tracking, offline behavior, and orientation/network changes.
3. Record observed results honestly in the phase review; a successful web preview does not establish native behavior.

## Polish

Consistent type scale and spacing against the established visual system, restrained motion, deliberate empty/error illustrations, and a final pass on the demo→real wording (the demo label must never appear in real mode).

## Verification

`npm run typecheck`, `lint`, `jest`, `export:web`, Playwright journeys (desktop/tablet/mobile), the new real-mode journey against the live backend, and the Android APK artifact + device checklist. Backend regression suites stay green.

## Still external (unchanged)

Real hostel names and arrival conditions, delivery-platform OTP verification, campus geometry/routes, camera storage, physical actuation.

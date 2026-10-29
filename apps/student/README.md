# Hostelxpress student app

A shared React Native / React Native Web application built with Expo SDK 58, TypeScript, and Expo Router. The app supports the local FastAPI demo and real Supabase sign-in against a configured backend. Demo payment never charges money or operates hardware; live payment and physical-device acceptance are separate integration checks.

## Run inside Ubuntu

From the repository root:

    source .tools/env.sh
    cd apps/student
    npm ci
    EXPO_PUBLIC_API_URL=http://localhost:8000 npm run web -- --port 8081

The repository's demo runner starts both the API and this application. Use that runner for the integrated preview rather than starting a second copy on the same ports.

`EXPO_PUBLIC_API_URL` contains the backend origin. Real sign-in additionally uses `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; only the public client key belongs in the app. Leave both Supabase values empty for the demo, or use the demo runner, which enforces that separation.

Only the API URL belongs in EXPO_PUBLIC_API_URL. Expo inlines public environment variables into client code. Never add Supabase service-role, Razorpay, webhook, MQTT, or device credentials. Native Android previews require a reachable development-server address instead of a handset's own localhost. Use an approved device/network configuration; production must use HTTPS.

## Implemented flow

- Explicit demo sign-in with editable name and demo hostel A–G, plus real Supabase sign-in/sign-up when configured.
- Registration preserves the entered name with the existing database trigger and keeps the hostel for onboarding after email confirmation. Existing saved profile fields are preserved. Legacy accounts displaying `Student` can correct their name through **Profile → Edit profile → Save changes**; the app does not guess whether a nonempty name was intentionally chosen.
- Responsive overview, booking dialog, server-assigned compartment, order history, profile, and help.
- Server-backed order progression through loading, dispatch, arrival, demo payment, and confirmed collection.
- Integer-paise fee display and a nonpayable server-supplied demo QR.
- Five-second polling, request timeouts, loading/error/empty states, and a fifteen-second device freshness indicator.
- An illustrative campus schematic; no actual campus coordinates, route, distance, live map, or arrival estimate is invented.
- Payment confirmation remains separate from physical unlock. Collection readiness additionally requires a fresh bot UNLOCKED acknowledgement.
- Demo bearer tokens stay in memory on both web and native. Reload/sign-out ends the app session. Generation checks prevent late responses from a previous session appearing in another session.

The visual system uses an off-white canvas, forest-green navigation, warm orange actions, bundled DM Sans / Manrope fonts, and Ionicons. All screens use native components and the same routing/data model on web and Android.

## Validation

    npm run typecheck
    npm run lint
    npm test
    npm run export:web

The Node tests cover the telemetry freshness boundary, terminal order behavior, payment-vs-unlock wording, and paise formatting. Integrated browser/device behavior is verified separately at repository level. Exported web assets go to ignored dist/. Native Android/iOS builds, accessibility assistive-technology testing, production authentication, and store distribution remain separate work.

The SDK-compatible dependency selection follows the official create-expo-app template and expo install. package-lock.json records the resolved versions. Expo SDK 58 is the current official stable template verified on 27 October 2026; SDK 57 remains the Expo Go transition option. This app uses SDK 58 and should use an appropriate development build for physical native testing.

## Dependency findings

The checked dependency audit reports high-severity findings in Expo CLI's transitive node-forge and Zod packages. At verification, node-forge 1.4.0 is the latest published version, and the affected CLI consumes Zod 3.25.76 while the advisory's fixed version is a different major line. The proposed npm force fix downgrades Expo to SDK 44 and is unsuitable. No unreviewed forced downgrade or incompatible override was applied. These toolchain findings must be reassessed before production packaging; an exported demo is not a security-clean production release.

Primary references:
- https://docs.expo.dev/get-started/create-a-project/
- https://docs.expo.dev/versions/v58.0.0/
- https://docs.expo.dev/router/installation/
- https://docs.expo.dev/workflow/web/
- https://docs.expo.dev/guides/environment-variables/
- https://github.com/advisories/GHSA-86w9-cpqp-85rv
- https://github.com/advisories/GHSA-mrhx-c7xc-m3w5

## Android QA builds

See [Android build instructions](../../docs/android-build.md) and [the device QA checklist](../../docs/device-qa-checklist.md). Native build artifacts are machine-local and are not committed to Git. A built APK is not evidence that it has been installed or tested on a physical phone.

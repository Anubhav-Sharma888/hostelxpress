# Phase 3 review — student app and Android QA preparation

Updated 29 October 2026. **Engineering checkpoint only: Phase 3 acceptance remains pending physical Android QA and user review.**

## Delivered

The student app supports real Supabase sign-in/signup and an isolated local demo, registration/profile completion, booking, tracking, payment and collection states, history, profile editing, responsive layouts, accessibility states and offline recovery.

Earlier application commits:
- `e70efd4`: real sign-in, in-memory sessions, publishable client key, backend profile upsert and partial-PATCH protection.
- `1da6e39`: screen-state coverage, profile editing, accessibility and local demo environment isolation.

This checkpoint preserves those changes and adds:
- `src/signup.ts` and mocked-boundary regression tests for confirmation-required signup, canonical metadata, preservation of existing profile values and stale-session responses.
- Exclusive demo/real Playwright selection, an offline selection verifier and matching Linux CI coverage.
- A tracked Ubuntu Android build script, build/runtime documentation and an explicit local QA network policy generated through an Expo config plugin.
- A current project progress record and hardware handoff links.

## Signup correction and compatibility

The original corrective draft saved `full_name`, while the existing Auth trigger consumes `name`, producing a nonempty `Student` profile that onboarding would not replace. New signups now send `name`. A direct bridge check inserted metadata produced by the actual app helper into the isolated local Auth fixture; the actual trigger preserved the intended name. Hostel completion remains an authenticated, backend-validated profile update.

Legacy `full_name` remains a read fallback only for missing names. An existing nonempty name, including `Student`, is never overwritten by metadata. Ambiguous legacy accounts can recover through **Profile → Edit profile → Save changes**. No live data migration was applied.

Generation checks guard confirmation outcomes, complete-profile returns and each post-request boundary. Test-first verification observed eight failing signup regressions before correction and 22 passing signup tests afterward.

## Fresh checks — 29 October 2026

- Backend: **47 passed** on a unique private disposable PostgreSQL 17 cluster.
- Connector: **17 passed, 3 subtests passed**.
- Schema/RLS: passed on a separate freshly initialized disposable PostgreSQL 17 cluster; assertions rolled back and both clusters stopped.
- App at corrected-source checkpoint: **30 passed** (4 model, 22 signup, 4 Android policy); typecheck and lint passed.
- Web export: passed.
- Browser demo journeys: **6/6 passed** (desktop/tablet/mobile booking, tracking, demo payment, collection and offline recovery); no real-mode test executed.
- Offline selection verifier: default 6 demo-only tests; explicit real mode 3 real-only tests. Both parent-env configurations passed. The pre-fix ambient-real-mode regression failed as expected.
- Final shell/build/APK results are appended below after source freeze.

A browser-wrapper cleanup command initially used the wrong working directory after tests. All six tests passed; cleanup was subsequently executed from the repository root and returned exit 0. The clean QA wrapper rerun for backend/connector/schema also returned exit 0. These were check-wrapper issues, not product failures.

## Android artifacts and runtime

The earlier local artifacts were structurally checked:
- Debug: 250462921 bytes, SHA256 `7df43f7ac371658a58529d2414409c327cd156df7345b6f9fad5e82057c03f84`, no bundled JavaScript; requires Metro.
- Standalone: 98449818 bytes, SHA256 `278db9d19b1563add4c3cbacbf1096ad12bb5ed36aa2eb8b5ac3b6de35bc1aca`, `assets/index.android.bundle` present.

Those are **historical artifacts from before the latest signup/network corrections**. Do not treat them as a build of this checkpoint. Updated build evidence, if produced, is appended below. APKs, generated native files and signing material stay out of Git.

Ordinary builds require an HTTPS backend. Explicit local QA builds use a scoped exact-localhost exception with USB reverse; they are not store or production releases. The native policy keeps global cleartext traffic denied. See [the build guide](android-build.md) and [device checklist](device-qa-checklist.md).

## Historical external evidence

The Phase 2 records and earlier sessions report live Supabase sign-in checks and provider configuration checks. A local Mosquitto TLS transport proof was recorded on 27 October. These were not rerun here, and do not establish current Supabase Auth/API behavior, HiveMQ permissions, Razorpay captured-payment/webhook behavior or physical actuation.

## Remaining acceptance and inputs

1. Physical Android QA: install/launch, sign-in, booking, connectivity, screen-reader and recovery checks.
2. Razorpay KYC/product availability and separately authorized payment/webhook integration.
3. Real OTP provider, hostel names, agreed arrival conditions and camera storage.
4. Robotics-team commissioning and physical interlocks.
5. Production signing, dependency-audit reassessment, hosting and deployment approval.

No live account creation, payment, public deployment, device enrollment or physical actuation occurred. Zero-cost local infrastructure was used. Phase 4 connector commissioning and Phase 5 release/pilot remain pending; the existing connector is not proof of those phases' acceptance.

## Review and publication

Independent read-only QA verified the backend/connector/database suites. Independent review identified the metadata, network-policy, clean-build and inherited-test-mode findings, which were assigned for correction. Final integration review and current commit CI status are recorded after verification. User authorization on 29 October permits the verified source/progress checkpoint to be committed and pushed; earlier work-order restrictions describe the prior state.

The ZCode continuation stopped when its plan quota ran out, before implementing the latest corrective sequence. The supervisor completed the corrective checkpoint with scoped implementation and QA agents.

## Final source verification and review

Source freeze: Android policy generation was checked in both modes. Default explicitly denies localhost cleartext; local QA permits only exact localhost with a cleartext-denying base. Isolated prebuild generated the expected manifest/XML and removed the QA exception when changed to ordinary mode. Bash syntax and ShellCheck passed. Three build-script CLI tests passed. Final app suite: **30 passed**. Typecheck/lint and web export passed on the corrective source.

An independent reviewer approved the combined source checkpoint with no material blockers after inspecting signup/state integration, Android configuration/build script, test selection, CI and documentation. No new hardware code was delivered.

The current-source standalone QA Gradle build was still running at publication preparation. Its result is **pending**; historical hashes above are not current-source build evidence. Phone QA remains unperformed. GitHub workflows are checked after pushing the commit.

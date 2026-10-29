# Supervisor review of ZCode Phase 3 close-out

> Historical record. The user subsequently authorized the verified GitHub update on 29 October 2026. Current status and corrections are in docs/progress.md and docs/phase3-review.md.

Reviewed 29 October 2026. Source context: the user-selected chat "Create LifeTrack AI review prompt", its HostelXpress continuation instruction, the completed ZCode task "proceed with the tash in here", and the authoritative Linux checkout at commit 1da6e39 plus its existing local changes.

## Verified directly

- The last instruction in the other chat authorized local Android build repairs, a debug APK, explicit real-mode test selection, local verification and a Phase 3 review record. It prohibited pushes, deployment, live-service modifications and invented phone-test results.
- The APK exists at apps/student/android/app/build/outputs/apk/debug/app-debug.apk.
- Size: 250462921 bytes.
- SHA-256: 7df43f7ac371658a58529d2414409c327cd156df7345b6f9fad5e82057c03f84 (matches ZCode's report).
- The APK ZIP has no .bundle or .hbc entry. This does not invalidate a Metro-dependent debug build, but it requires an explicit development-server procedure before phone QA.
- bash -n accepts the repaired machine-local Android environment file.
- The Phase 3 review is present. Its reported suite counts were read, not independently rerun in this supervisor pass.
- No code was committed, pushed or deployed by this supervisor.

## Corrective findings sent to ZCode

1. Document and verify how the debug APK obtains JavaScript and reaches Metro/backend on a phone. Produce a separately identified bundled tester artifact if feasible at zero cost; otherwise state the development-server dependency accurately.
2. Make the Android environment setup and required build compatibility workaround reproducible through tracked scripts/configuration. The repaired .tools files and android/gradle.properties are ignored; a clean checkout/prebuild otherwise loses them.
3. Make browser-test mode selection exclusive. The inspected config selected six demo tests by default but all nine with HX_E2E_REAL=1, including incompatible demo-only journeys on the real-mode base URL.
4. Preserve safe signup profile fields through email confirmation. The inspected state.tsx signUp sent only email/password and returned before the profile PATCH when no immediate session was issued. Cover confirmation-required, immediate-session and changed-session cases without live accounts or persisted credentials.

## Delegated next step

A bounded corrective instruction was submitted in the existing HostelXpress ZCode task. Its UI confirmed GLM-5.3-Flash Max was working on the new request. Changes must stay in Ubuntu and remain local, preserve existing edits, avoid unrelated UI changes and external services, and stop with evidence for supervisor review. Phase 3 acceptance remains pending actual physical phone QA; Phase 4 was not authorized by this corrective instruction.

This record confirms the review and dispatch. It does not claim the corrective work has completed.

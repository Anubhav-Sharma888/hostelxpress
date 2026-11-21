# Campus hostel correction and staging checkpoint - 21 November 2026

The owner confirmed six hostels, replacing the seven river-name placeholders.

| Identifier for new selections | Hostel | Residents |
| --- | --- | --- |
| bhagat-singh | Bhagat Singh Hostel | Boys |
| ratan-tata | Ratan Tata Hostel | Boys |
| apj-abdul-kalam | APJ Abdul Kalam Hostel | Boys |
| vikram-sarabhai | Vikram Sarabhai Hostel | Boys |
| kalpana-chawla | Kalpana Chawla Hostel | Girls |
| gargi | Gargi Hostel | Girls |

These identifiers are app configuration, not surveyed routes or official block designations. Existing saved A-G destinations keep their values and display as "Saved hostel C", for example. No legacy code is guessed to mean a real hostel. Booking/profile editing requires explicit current-hostel selection when an older value is saved. No database migration, historical-order rewrite, routing coordinates or gender-based access rule is introduced.

Signup/profile selection, booking, home coverage, delivery/history labels, illustrative-map labels and offline samples use the roster. Long hostel names render outside the narrow map label area. Android builds supply the confirmed support number by default. Version 1.6.0/versionCode 9 is above v1.5.2/versionCode 8; package and signing configuration are preserved.

## Owner-reported phone check
The owner confirmed the requested updates were okay after receiving the support-fixed APK from e780367. This is user-reported acceptance, not an agent-observed phone test. That APK's SHA-256 was 79461f946947347c9800aadf35ba0feaaf3ad250e6d4c39d57b624601f7ced09. Signature, bundled number/API URL and byte-identical manifest/network policy were checked. This does not validate the new hostel build.

## Validation status
Prepared for the isolated Ubuntu checkout. TypeScript, lint, student tests, web export, a fresh Android build and phone verification remain to be run for this update. No new pass is claimed in advance.

## Next staging gate
Verify the six-hostel APK and real Supabase client configuration using only the publishable key. Then check authenticated profile completion/update and an authorized designated-account staging booking: destination selection, reload persistence, ownership and error handling. Older saved destinations must require explicit reselection. Staging bookings remain unassigned Pending test records, without dispatch or payment.

Full OTP integration still needs a separately approved isolated environment, migration 0004, backend/operator keys, enrolled devices and signed transport. Real payments, MQTT/device operations, physical commands and PR merging remain outside this checkpoint. Do not repeat rejected live-provider QR creation requests.

## Validation update - owner-executed Ubuntu checks

The owner applied all 20 files in the isolated checkout and provided successful TypeScript, lint, 37/37 student tests and web-export output. The trailing PowerShell m command failed after the checks had completed and did not invalidate those results. Native packaging and phone checks for version 1.6.0 remain pending. GitHub CI for the new commit is recorded separately once finished.

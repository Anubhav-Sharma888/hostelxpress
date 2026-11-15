# Android build stall recovery — 15 November 2026

User reported repeated stops and 4–5 hours without apparent progress. Inspected ZCode task and actual Ubuntu build.

## Diagnosis
At15:14IST a single Gradle build had been alive for about3hours in hx-apkB2-1794724314.scope. MemoryMax2.3GB, MemoryHigh2.2GB, swap0, affinity0,1, nice10. memory.events high exceeded5.5million. Full memory PSI avg300 about94%. JVM remained active in lint and R8. CPU alone had been interpreted as healthy progress, but the cgroup was severely memory-throttled. Quiet Gradle and checking old log files obscured the phase. NoOOM was recorded.

## Recovery
Changed the existing scope live to user-authorized MemoryMax3500000000, MemoryHigh2800000000, MemorySwapMax0 and CPUQuota200%. Verified memory.max3499999232, memory.high2799996928, no swap and retained two-CPU affinity. No build restart/cache clearing. Within roughly1minute lintVitalAnalyzeRelease and lintVitalReportRelease produced results and release resource/metadata tasks advanced. Subsequent thread dumps showed R8 optimization work changing, and current memory PSI full avg10 fell to0.00%. Existing high event count is cumulative and must not be presented as new events.

Corrected .tools/launch-apk-final.sh future launch limits to3.5GB/2.8GB. Removed -q and added --console=plain in .tools/run-apk-resume.sh for future runs. Removed apksigner|head under pipefail to avoid signature verification failure from a closed pipe. bash -n passed. These local .tools files are untracked runtime helpers, not production source. Preserved prior dirty source and build caches.

Saved diagnostic thread snapshots and pressure readings in .tools/apk-stall-* and queued the repair instructions in the existing ZCode task. APK completion still requires an actual artifact and verification; observed advancement alone is not final build success. All work remains within the aggregate3.5GB project cap and two logical CPUs.

## Completed outcome
At15:18IST the same build produced apps/student/android/app/build/outputs/apk/release/app-release.apk, 99,217,254 bytes. SHA256 b28d45c978d52f353a506b574f40b9869352c686d9611ced7687099af14fe7f3.
apksigner verify succeeded with the Android Debug certificate (local QA identity). assets/index.android.bundle is present,3,388,592bytes. Packaged manifest usesCleartextTraffic=false and references hostelxpress_network_security. Original scope ended; no duplicate build was launched. Resource and lint outputs appeared within1minute of the live adjustment; APK appeared about4minutes after adjustment. ZCode acknowledged the repair and resumed monitoring. This is an APK verification result, not a physical-phone runtime acceptance.

# Stitch visual fidelity correction — 7 November 2026

User rejected the token-only redesign after viewing localhost. Reference is the supplied stitch_hostelxpress_app_redesign (2).zip, extracted locally to .tools/stitch-reference.

## Implemented
- Rebuilt shared mobile header, bottom navigation and desktop horizontal navigation, home delivery hero/waypoints/progress, booking/recent cards and sign-in composition from the exported layouts.
- Vendored Inter and Plus Jakarta Sans with OFL licenses. Legacy component font aliases map to these local fonts.
- Added dark/lime/lavender After Hours and merchant/shop compositions, original exported illustrative merchant imagery, server-backed departure capacity panels and grouped merchant queues.
- Replaced the old green campus illustration with a dark schematic and lime route. Position is explicitly delivery-stage-based; no live-coordinate claim.
- Restyled parcel, booking, history and profile surfaces. Corrected narrow text wrapping, 48dp targets and profile/header sizing after independent read-only QA.
- Auth/session behavior, existing routes, quote confirmation, and payment/hardware-state boundaries retained.

## Current-source verification
- App tests 30 passed, typecheck and lint passed.
- Gate 2 demo browser journeys 6 passed across desktop/tablet/mobile, including offline recovery.
- Browser captures at 360, 390 and 1440px: no runtime errors or home horizontal overflow.
- git diff --check passed for changed app/test sources.
- Final captures are local Windows review artifacts in .review/stitch/current-*.png.
- Full After Hours browser journey was not rerun in this UI checkpoint. Physical Android, TalkBack and real-service acceptance remain pending.
- Visual adaptation uses configured user/order data and server capabilities. The exported mockups contain fictional telemetry, obsolete compartment counts, broken logos and unsupported controls; these were adapted to the existing product. Exact pixel parity across every exported screen is not asserted.

## Resource evidence and preview state
- Existing Android build is frozen, preserving processes and compiled work. Its current hard memory limit is 1.6GB.
- Preview hard max1.1GB and final browser-check max0.8GB, total hard maxima3.5GB. Swap max0. Linux processes inherit CPU affinity0,1 and low scheduling priority.
- CPUQuota200% was requested, but the user cgroup subtree lacks the CPU controller, so quota enforcement is not claimed; two-CPU affinity provides the CPU bound.
- Final source-check peak864210944 bytes, high-throttling occurred under the initial smaller allowance, no OOM. Final delivery-browser peak645079040 bytes, no high/max/OOM events.
- One browser attempt was stopped after it overlapped the slow lint check; it was rerun alone and all6 passed. Heavy verification completed sequentially after that correction.
- Localhost preview remains at http://localhost:8081 in demo mode. Android build remains paused while preview is in use. The existing APK build snapshot predates this redesign.
- Changes remain local pending publication review. No live payment, hardware actuation or deployment performed.

## Superseding user direction

The user requires the original ZIP (2) visual layouts unchanged. The earlier adaptation is not visual acceptance. Match reference screen geometry, hierarchy, spacing, type, component placement and navigation before claiming fidelity. Live values remain data-bound. Exact visual replacement is in progress; the existing passing functional tests do not establish visual parity.

## Replica pass checkpoint

- Home now matches the mobile reference section order and dimensions much more closely. It uses the compact waypoint hero, rover progress marker, three stat cards, quick-select booking chips, dark booking CTA, recent delivery and lavender advisory. The four mobile tabs follow the export. Tracking links to the student's active delivery or history when idle. Mobile Help remains available in Profile.
- Booking now uses the export's page structure on mobile, with checkpoint, destination list, parcel information, fare summary, primary action and exported campus imagery. Sign-in uses a single stacked form layout. Tracking aligns the map on the right on desktop and places the status, map, pickup advisory and timeline in the mobile flow.
- Handover now uses a four-stage pickup strip, dark unlock-waiting panel, lime collection panel, three-bay orientation and secured-compartment success panel with original exported illustrations. Server state still governs payment and physical handover.
- Typecheck, lint and 30 app tests passed on final source. Six demo delivery journeys passed after the home, booking, sign-in and tracking changes. The mobile booking-through-collection journey passed again after the handover panels were added. The browser preview responds on localhost:8081.
- Remaining replica work includes separate visual comparisons for each handover state, history, support, registration, profile, After Hours, Tuck Shop, hot food and merchant screens. Exact visual parity is still open. Real data replaces reference fixture values. Unsupported mock controls and telemetry need explicit treatment during the screen comparisons.
- The Android scope remains frozen. During verification the hard memory maxima were 1.6 GB for the frozen build, 1.1 GB for the preview and 0.8 GB for the verification scope. Heavy checks ran sequentially with affinity to two logical CPUs.

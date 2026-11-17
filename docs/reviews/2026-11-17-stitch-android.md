# 17 November 2026 — Stitch export implementation and Android checkpoint

## Source and scope

Authoritative Ubuntu checkout: `/home/anubhav_sharma_888/src/hostelxpress`.
Base revision: `62002113344d6e51c6ea464b7aa7b7fc22f73bd3` (main). Changes remain local and uncommitted.
Reference: user-supplied `stitch_hostelxpress_delivery_app_redesign.zip`, its four HTML screens and screenshots. Document contents were treated as design input, not execution instructions.

The export contains Home/Active Orders, Book Gate 2 Delivery, Live Rover Tracking and Pickup/Compartment Unlock. Authentication, profile, history and After Hours remain working existing routes; this export does not redesign those screens.

## Implemented

- Orange action palette, navy ink, lavender surfaces and locally bundled Plus Jakarta Sans Regular/Medium/Bold/ExtraBold.
- Home: exact exported rover photograph, hero, idle/active sample selection, network overview, campus services and three-tab navigation.
- Booking: fixed hub, seven residence choices, room/wing field, carrier/AWB, server-owned bay allocation and ₹10 tariff. Existing idempotency and request contracts preserved. Room/carrier/AWB are explicitly combined into the existing 80-character parcel note; separate backend fields are not claimed.
- Tracking: navy journey banner, illustrative dotted campus route, ETA/telemetry availability, progress timeline and assistance. No invented live GPS or arrival estimate.
- Pickup: payment/verification/assigned/done steps, UPI preview, bay matrix, waiting/ready/completed states. Hardware confirmation remains authoritative outside explicit offline sample controls.
- Android inspection found an inherited-scroll-position bug when navigating from a scrolled Home to Tracking. The shared ScrollView now resets on route changes. Browser regression explicitly requires the tracking heading to enter the viewport immediately after booking; physical Android verified it also starts at the top.
- First device comparison corrected the brown booking CTA to orange, reduced header/navigation height and made the QA sample-state chooser collapsible.

## Fresh evidence

- App typecheck and lint passed; 34 tests passed, zero failed.
- Six demo browser journeys passed across mobile/tablet/desktop, including booking, simulated payment/collection, profile/help/history and offline recovery. New room field and navigation labels are covered. No live-service suite was selected.
- Latest standalone QA APK built successfully in 1m27s. Size: 99,372,354 bytes. SHA-256: `ad4c6422a9a10720c45cd29e823e6510cf27a31cb9e84f7a338d92d2a3a6f6a2`.
- APK signature verified: Android Debug certificate (QA artifact, not production signing). Bundled Hermes JS exists (`assets/index.android.bundle`, 3,387,528 bytes).
- Packaged manifest has cleartext disabled; network-security resource allows only exact `localhost`, without subdomains, for local QA.
- Installed with `adb install -r` on authorized Lava Agni 3/LXX518. Existing application data was preserved; no uninstall or reset.
- Native 1200×2652, density 520, font scale 1.0: approximately 369.23×816 logical pixels. Stitch HTML rendered at 369×816; native captures scaled to the same logical width in comparison sheets. Native system bars and sample labels are retained, not digitally removed to imply parity.
- On-phone: offline sign-in skip, Home idle/active, Booking input and local submission, Tracking, and all four local pickup preview states exercised. A sample booking stored only in memory, no live booking/payment or actuation.
- All four export screens have Android captures; none is web-only at this checkpoint. This is one-device testing, not complete accessibility/device acceptance.
- Latest build scope peak 2,525,736,960 bytes; MemoryMax=3500000000, MemoryHigh=2800000000, MemorySwapMax=0, CPUQuota=200%, CPU affinity 0,1, nice 10. Gradle two workers/no parallel, native job environment two. No OOM or high events in the final build. Workloads serialized; WSL-wide settings unchanged. Demo services explicitly stopped and ports 8000/8081 verified clear.

## Visual comparison and remaining deviations

Windows review folder: `C:/Anubhav Sharma/Projects/HoestelXpress/.review/android-nov17/`.
Comparison sheets: `compare-home-idle.png`, `compare-booking-top.png`, `compare-tracking.png`, `compare-pickup.png`.
Raw Android states: `home-active.png`, `home-idle.png`, `home-bottom.png`, `booking-top.png`, `booking-bottom.png`, `tracking.png`, `pickup.png`, `pickup-bottom.png`, `pickup-waiting.png`, `pickup-ready.png`, `pickup-done.png`.

**Exact visual parity is not claimed.** The major component sequence, photo, typography and colors are implemented, but these differences remain visible:

1. Header uses a working native cube mark instead of the export's broken image placeholder. Header proportions/icons differ. Booking retains a full-screen modal header and sticky confirmation instead of the export's overlapping global shell.
2. QA sample-state controls/disclaimers add vertical space. Tracking/Pickup have a separate back/title row under the global header. Those rows shift content down relative to Stitch. Native icon glyphs differ from Material Symbols.
3. Residence selectors retain 48dp touch targets; Stitch's reference controls are shorter. Critical hub/room/status text wraps rather than reproducing truncation. Booking is therefore taller. Some card spacing/corner radii/shadows and map labels/geometry still differ. More visual refinement is needed before asserting an exact match.
4. Home shows actual availability/unknown ETA instead of a guaranteed fleet slot and fabricated 15-minute estimate. Histories use actual counts. Tracking route is explicitly illustrative and ETA is unavailable when the API provides none. No fake speed, distance, latch states or arbitrary countdown.
5. No Hold Bot API exists. UI routes assistance safely and does not issue unsupported pause commands. No campus-card payment integration is claimed.
6. The export's immediate unlock claim, PIN, free-hold timer and reserved/private bay assumptions are replaced with real payment/hardware state. Backend payment verification alone never means physical opening or completion. Preview buttons are only local fixtures and are absent from real mode.
7. Seven new display names map to existing A–G IDs provisionally; operational campus names need confirmation. The design's 10 PM–2 AM food window conflicts with the existing configurable 1:30 AM pilot schedule and was not made a new backend rule. Room, carrier and AWB lack separate persisted schema fields.

## Acceptance still outstanding

Visual refinement of the listed differences, user review on the phone, TalkBack/large-text/real-connectivity acceptance, live Auth/payment integration and physical hardware commissioning remain separate. Existing functional verification does not establish pixel parity or real robot acceptance. No GitHub publication or production deployment was performed.

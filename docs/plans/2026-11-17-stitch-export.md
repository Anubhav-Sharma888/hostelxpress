# 17 November Stitch implementation and acceptance

Base revision62002113344d6e51c6ea464b7aa7b7fc22f73bd3, clean at start.
Reference new delivery_app_redesign ZIP four PNG/HTML screens, not older lime export.
1. Home/Booking first: native orange/surface/teal theme, 3tab shell, imagery, exact composition. Keep offline QA and server flow. Display new hostel names against existing A-G keys with explicit pending campus mapping. Room/courier data must not be silently discarded.
2. Tracking/Pickup: native route diagram, banner, ETA/telemetry fallback, timeline,3bays and4states. No fabricated hold-command/card/PIN/countdown. Payment remains backend-verified; physical closure remains authoritative.
3. Check tsc/lint/app tests; browser offlineQA and demo delivery regression. Side-by-side originalPNG/current screenshot at390dp or exact screenshot width. Capture Android if connected via LinuxADB; web-only results explicitly pendingAndroid. Record conflicts/deviations byscreen.
4. One heavyworkload, total3.5GB hard memory,2.8GB high,swap0,twoCPUaffinity,nice10,Gradle2workers/no parallel; no Windowsdevelopment or simultaneousbuild/test. No commits/publishing requested.

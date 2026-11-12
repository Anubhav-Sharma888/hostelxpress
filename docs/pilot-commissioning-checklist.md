# Hardware commissioning checklist — After Hours pilot rover

For the robotics team's first real rover attached to the After Hours pilot. Local evidence (unit suites, the adapter acceptance harness, browser journeys) covers software behavior only; every item below needs the physical rig.

## Before the rover ships to campus

- [ ] Bot UUID enrolled by the backend operator; per-device HTTP HMAC secret (≥32 chars) handed over privately; TLS MQTT identity restricted to that bot's topics (`docs/hardware-handoff.md`).
- [ ] `HOSTELXPRESS_*` configuration validated on the rover's Raspberry Pi/companion: `HOSTELXPRESS_ALLOW_LOOPBACK_HTTP` unset (HTTPS only), CA bundle present, ledger on persistent storage (never `/tmp`).
- [ ] The refusing stubs in `examples/wiring.py` replaced with the team's real `guard`, `on_unlock`, and `clock_synchronized` functions; a guard that returns `True` without reading actual sensors is a hard no-go.
- [ ] Time-sync health check wired (chrony/systemd-timesyncd) — the connector refuses commands on an unsynchronized clock.
- [ ] Compartment sensors report actual lid/parcel state; the connector never invents safe readings.

## Bench acceptance (no campus navigation)

- [ ] `HOSTELXPRESS_ADAPTER_ACCEPTANCE=1 python3 tests/integration/adapter_acceptance.py` passes against the rover's own ledger (duplicate delivery, restart without replay, expired/retained refusal).
- [ ] A signed command with a wrong order, compartment, expired TTL, retained flag, unknown clock, unsafe lid, or active fault never actuates.
- [ ] Uncertain execution (crash mid-unlock) leaves the compartment locked and requires operator reconciliation — verified on the real controller.
- [ ] Broker ACL: the rover cannot publish commands or see another bot's topics.

## Campus pilot

- [ ] Arrival conditions agreed and implemented by the navigation team (the app reports arrival only from their callback).
- [ ] Rider OTP authorization adapter verified by the delivery platform (the outer-lid flow stays blocked until this exists).
- [ ] Tuck Shop batch: rovers depart per departure window with the merchant's Confirm loaded; the backend's reconciliation worker owns expiry.
- [ ] Hot food: insulated bay assigned by the backend ("Bay 01 · Insulated"); temperature control is the hardware team's domain — the app never displays invented readings.
- [ ] Failure footage: camera ring buffer preserves the last 120 s; storage/cleanup authorization configured before enabling evidence upload (camera endpoints return 501 until then).

## Separation of evidence

Local suites + the acceptance harness + browser journeys = software correctness on disposable infrastructure. None of it proves live broker permissions, real payment capture, campus navigation, or physical safety — those are the pilot checks above and the robotics team's own sign-off.

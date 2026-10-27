# Actual local MQTT transport proof

This opt-in check uses real Mosquitto TLS sockets, the application MQTT bridge/worker, the device connector, signed HTTP to a real FastAPI listener, and PostgreSQL 17. Its actuator callback only increments a counter. Payment is a synthetic database fixture; no gateway or physical hardware is contacted.

Prerequisites inside Ubuntu: the repository Python environment and application dependencies, PostgreSQL 17, OpenSSL, Mosquitto, and mosquitto-clients. The test installs no system packages and requests no password.

Run from the repository root:

    HOSTELXPRESS_MQTT_PROOF=1 bash scripts/check_mqtt_link.sh

Without the variable, the check reports SKIP. It is excluded from default CI.

Ports 18883 (TLS broker) and 8002 (FastAPI) must be free on loopback. A new private PostgreSQL cluster under .tools/mqtt-proof-*/ uses Unix sockets only. The demo/shared test databases and Supabase are never used. CA keys, certificates, password hashes, ledger, logs, and database files remain in that private directory and are removed after success. Finally cleanup stops every owned test process; cleanup failures retain the private directory for investigation.

Assertions cover actual MQTT telemetry persisted by the backend; real worker publication; guarded fake callback; HMAC HTTP accepted/executed acknowledgements; outbox executed; exact command-byte replay before/after ledger-preserving restart with callback count one; denial of bot writes to own/other command topics; wrong broker password rejection; and invalid HTTP HMAC rejection.

Three random bot/publisher/ingest identities have scoped ACLs and anonymous access is disabled. Disposable plaintext passwords go to mosquitto_passwd over stdin, not command arguments or logs.

This is a local Mosquitto compatibility check. It does not establish HiveMQ Cloud permissions, real payment verification, Pi/STM32 behavior, physical sensor correctness, or exactly-once mechanical action across arbitrary failures.

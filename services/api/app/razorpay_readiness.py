"""Read-only Razorpay TEST-account readiness check (no payments or QR creation).

This optional operator-run diagnostic reads only environment-provided TEST keys.
It never sends live credentials or prints response payloads / secret values.
Running this module does NOT prove that QR creation, simulated QR scanning,
payment capture, or real settlement works.
"""
from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass

import httpx

TEST_ENDPOINT = "https://api.razorpay.com/v1"


@dataclass(frozen=True)
class TestReadiness:
    mode: str
    authentication: str
    qr_list_readable: bool
    test_webhook_secret_configured: bool
    qr_create_verified: bool = False
    payment_webhook_verified: bool = False
    live_money_moved: bool = False


def verify_test_account(
    key_id: str,
    key_secret: str,
    webhook_secret: str = "",
    *,
    transport: httpx.BaseTransport | None = None,
) -> TestReadiness:
    """GET only. Refuses any non-test key before making a network request."""
    webhook = bool(webhook_secret and webhook_secret.strip())
    if not key_id or not key_secret:
        return TestReadiness("test", "credentials_missing", False, webhook)
    if not key_id.startswith("rzp_test_"):
        return TestReadiness("test", "non_test_key_refused", False, webhook)
    if len(key_secret) < 12:
        return TestReadiness("test", "secret_too_short", False, webhook)
    try:
        with httpx.Client(
            base_url=TEST_ENDPOINT,
            auth=(key_id, key_secret),
            timeout=10,
            follow_redirects=False,
            transport=transport,
        ) as client:
            # This endpoint LISTS existing QR records. It cannot create a QR,
            # capture a payment, trigger a webhook, or initiate a real charge.
            result = client.get("/payments/qr_codes", params={"count": 1})
        if result.status_code == 401:
            status = "authentication_rejected"
        elif result.status_code == 403:
            status = "forbidden_or_product_not_enabled"
        elif result.status_code == 429:
            status = "provider_rate_limited"
        elif 300 <= result.status_code < 400:
            status = "unexpected_redirect"
        elif result.status_code != 200:
            status = "provider_error"
        else:
            try:
                payload = result.json()
            except ValueError:
                payload = None
            status = (
                "qr_read_api_ok" if isinstance(payload, dict)
                and payload.get("entity") == "collection"
                and isinstance(payload.get("items"), list)
                else "unexpected_provider_response"
            )
        return TestReadiness("test", status, status == "qr_read_api_ok", webhook)
    except httpx.HTTPError:
        return TestReadiness("test", "network_or_tls_error", False, webhook)


def main() -> int:
    result = verify_test_account(
        os.environ.get("RAZORPAY_KEY_ID", ""),
        os.environ.get("RAZORPAY_KEY_SECRET", ""),
        os.environ.get("RAZORPAY_WEBHOOK_SECRET", ""),
    )
    # Fixed, non-sensitive fields only. Never print raw provider response or
    # HTTP auth headers, account details, URLs or environment variables.
    print(json.dumps(asdict(result), sort_keys=True))
    return 0 if result.qr_list_readable else 2


if __name__ == "__main__":
    raise SystemExit(main())

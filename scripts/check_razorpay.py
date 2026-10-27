#!/usr/bin/env python3
"""Opt-in Razorpay sandbox check: key validity and QR product availability.

Creates one single-use INR 10 UPI QR exactly as the backend does, verifies its
fields, and closes it for cleanup. Test-mode keys only unless
HOSTELXPRESS_ALLOW_LIVE_KEYS=1 is set explicitly. No money moves; a webhook
delivery test additionally needs a public HTTPS URL configured in the dashboard.

Set HOSTELXPRESS_CHECK_RAZORPAY=1 and RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET in
the environment (or the checkout-root .env). Secrets are never printed.
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_dotenv() -> None:
    env_file = ROOT / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip("'\"")
        os.environ.setdefault(key, value)


def main() -> int:
    load_dotenv()
    if os.environ.get("HOSTELXPRESS_CHECK_RAZORPAY") != "1":
        print("SKIP: set HOSTELXPRESS_CHECK_RAZORPAY=1 to check the configured Razorpay keys.")
        return 0
    key_id = os.environ.get("RAZORPAY_KEY_ID", "")
    key_secret = os.environ.get("RAZORPAY_KEY_SECRET", "")
    if not key_id or not key_secret:
        print("FAIL: set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET (test mode) first.", file=sys.stderr)
        return 2
    if key_id.startswith("rzp_live") and os.environ.get("HOSTELXPRESS_ALLOW_LIVE_KEYS") != "1":
        print("FAIL: refusing to run against live keys; use test keys or set HOSTELXPRESS_ALLOW_LIVE_KEYS=1.", file=sys.stderr)
        return 2
    results: dict = {"key_mode": "live" if key_id.startswith("rzp_live") else "test"}
    try:
        import httpx

        with httpx.Client(base_url="https://api.razorpay.com/v1", auth=(key_id, key_secret),
                          timeout=15, follow_redirects=False) as client:
            listing = client.get("/payments/qr_codes", params={"count": 1})
            if listing.status_code == 401:
                raise RuntimeError("Razorpay rejected the key pair (HTTP 401)")
            if listing.status_code != 200:
                raise RuntimeError(f"QR list request returned HTTP {listing.status_code}")
            results["authentication"] = "passed"

            # Same shape as app.payments.RazorpayProvider.create_qr.
            create = client.post("/payments/qr_codes", json={
                "type": "upi_qr", "name": "Hostelxpress delivery", "usage": "single_use",
                "fixed_amount": True, "payment_amount": 1000, "close_by": int(time.time()) + 300,
                "notes": {"hostelxpress_check": "sandbox product availability"}})
            if create.status_code != 200:
                raise RuntimeError(f"QR creation returned HTTP {create.status_code}: {create.text[:200]}")
            qr = create.json()
            if not (isinstance(qr.get("id"), str) and qr["id"] and qr.get("payment_amount") == 1000
                    and qr.get("fixed_amount") is True and qr.get("usage") == "single_use"
                    and qr.get("type") == "upi_qr"):
                raise RuntimeError("Provider QR does not match the fixed-price single-use intent")
            results["qr_fields"] = "passed"
            results["qr_id"] = qr["id"]

            fetched = client.get("/payments/qr_codes/" + qr["id"])
            results["qr_fetch"] = "passed" if fetched.status_code == 200 else f"HTTP {fetched.status_code}"
            close = client.post("/payments/qr_codes/" + qr["id"] + "/close")
            results["qr_close_cleanup"] = "passed" if close.status_code in (200, 400) else f"HTTP {close.status_code}"
            results["note"] = "Webhook delivery verification needs a public HTTPS backend URL configured in the dashboard."
    except Exception as error:  # Operator-facing: a short reason, never a secret.
        results["error"] = type(error).__name__ + ": " + str(error)[:400]
        print(json.dumps({"check": "razorpay", "result": "fail", **results}, indent=2))
        return 1
    print(json.dumps({"check": "razorpay", "result": "pass", **results}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

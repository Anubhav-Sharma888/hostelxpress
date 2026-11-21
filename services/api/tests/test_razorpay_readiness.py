"""Read-only TEST-mode probe, entirely offline with httpx.MockTransport."""
from __future__ import annotations

import base64
import json

import httpx
import pytest

from app.razorpay_readiness import verify_test_account

KEY_ID="rzp_test_disposable_fixture_only"
KEY_SECRET="only-a-local-fixture-no-provider-key"


def test_probe_is_read_only_authenticates_with_test_keys_and_hides_credentials():
    seen = []
    def handler(request):
        seen.append(request)
        return httpx.Response(200, json={"entity": "collection", "items": [], "count": 0})
    transport = httpx.MockTransport(handler)
    result = verify_test_account(KEY_ID, KEY_SECRET, "test-webhook-only", transport=transport)
    assert result.authentication == "qr_read_api_ok"
    assert result.qr_list_readable and result.test_webhook_secret_configured
    assert not result.qr_create_verified and not result.payment_webhook_verified
    assert not result.live_money_moved
    assert len(seen)==1
    assert seen[0].method=="GET"
    assert seen[0].url.path=="/v1/payments/qr_codes"
    assert dict(seen[0].url.params)=={"count": "1"}
    assert base64.b64decode(seen[0].headers["Authorization"].removeprefix("Basic ")).decode()==KEY_ID+":"+KEY_SECRET
    assert KEY_ID not in repr(result) and KEY_SECRET not in repr(result)
    assert "test-webhook-only" not in repr(result)


@pytest.mark.parametrize("key_id,secret,status",[
    ("","", "credentials_missing"),
    ("rzp_live_must_not_be_sent", "a-long-live-secret", "non_test_key_refused"),
    ("rzp_test_short", "short", "secret_too_short"),
    ("another_prefix", "test-secret-long-enough", "non_test_key_refused"),
])
def test_bad_or_live_credentials_never_make_network_request(key_id,secret,status):
    def forbidden(_):
        raise AssertionError("The probe must never contact Razorpay")
    result=verify_test_account(key_id,secret,transport=httpx.MockTransport(forbidden))
    assert result.authentication==status
    assert not result.qr_list_readable


@pytest.mark.parametrize("status_code,result_code", [
    (401,"authentication_rejected"),
    (403,"forbidden_or_product_not_enabled"),
    (429,"provider_rate_limited"),
    (302,"unexpected_redirect"),
    (500,"provider_error"),
    (400,"provider_error"),
])
def test_probe_reports_codes_without_leaking_provider_body(status_code,result_code):
    result=verify_test_account(KEY_ID,KEY_SECRET,transport=httpx.MockTransport(
        lambda _:httpx.Response(status_code,text="provider-secret-that-must-not-be-shown")))
    assert result.authentication==result_code
    assert not result.qr_list_readable
    assert "provider-secret" not in repr(result)


def test_unexpected_or_malformed_provider_response_is_not_success():
    for response in (httpx.Response(200,text="not-json"),
                     httpx.Response(200,json={"entity":"collection","items":{}}),
                     httpx.Response(200,json={"entity":"wrong","items":[]})):
        result=verify_test_account(KEY_ID,KEY_SECRET,transport=httpx.MockTransport(lambda _:response))
        assert result.authentication=="unexpected_provider_response"
        assert not result.qr_list_readable


def test_network_error_is_non_fatal_and_does_not_reveal_the_key():
    def blocked(_):
        raise httpx.ConnectError("fixture",request=httpx.Request("GET","https://api.razorpay.com/v1/payments/qr_codes"))
    result=verify_test_account(KEY_ID,KEY_SECRET,transport=httpx.MockTransport(blocked))
    assert result.authentication=="network_or_tls_error"
    assert KEY_SECRET not in repr(result)

from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.throttle import FailureThrottle


def test_failure_throttle_saturates_per_key():
    throttle=FailureThrottle(limit=2,window_seconds=60)
    throttle.check('10.0.0.1')
    throttle.check('10.0.0.1')
    with pytest.raises(HTTPException) as saturated:
        throttle.check('10.0.0.1')
    assert saturated.value.status_code==429
    throttle.check('10.0.0.2')  # Other addresses keep their own budget.


def test_security_headers_on_health_and_api(client):
    health=client.get('/health')
    assert health.status_code==200
    assert health.headers['x-content-type-options']=='nosniff'
    assert health.headers['referrer-policy']=='no-referrer'
    refused=client.get('/v1/me')  # Unauthenticated API response.
    assert refused.status_code==401
    assert refused.headers['cache-control']=='no-store'
    assert "frame-ancestors 'none'" in refused.headers['content-security-policy']


def test_device_and_webhook_failures_throttle(client,database_url):
    settings=Settings(app_env='production',database_url=database_url,supabase_url='https://example.supabase.co',
                      razorpay_webhook_secret='test-only-webhook-secret-not-a-live-credential',
                      worker_enabled=False,trusted_hosts='testserver')
    with TestClient(create_app(settings)) as live:
        live.app.state.device_throttle=FailureThrottle(limit=3)
        live.app.state.webhook_throttle=FailureThrottle(limit=3)
        device_path=f'/v1/devices/{uuid4()}/messages'
        for _ in range(3):
            assert live.post(device_path,content=b'{}',headers={'Content-Type':'application/json',
                             'X-Device-Timestamp':'0','X-Device-Signature':'0'*64}).status_code==401
        assert live.post(device_path,content=b'{}',headers={'Content-Type':'application/json',
                         'X-Device-Timestamp':'0','X-Device-Signature':'0'*64}).status_code==429
        for _ in range(3):
            assert live.post('/webhooks/razorpay',content=b'{}',
                             headers={'X-Razorpay-Signature':'0'*64,'X-Razorpay-Event-Id':str(uuid4())}).status_code==401
        assert live.post('/webhooks/razorpay',content=b'{}',
                         headers={'X-Razorpay-Signature':'0'*64,'X-Razorpay-Event-Id':str(uuid4())}).status_code==429

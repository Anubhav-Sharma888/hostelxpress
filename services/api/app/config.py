from __future__ import annotations

import ipaddress
import secrets
from functools import lru_cache
from urllib.parse import urlparse
from uuid import UUID

from psycopg.conninfo import conninfo_to_dict
from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # OS environment wins over the optional checkout-root .env file, which the
    # operator maintains manually; it is gitignored and never reviewed or synced.
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
    app_env: str = 'production'
    database_url: str
    supabase_url: str = ''
    cors_origins: str = 'http://localhost:8081,http://127.0.0.1:8081,http://localhost:5173,http://127.0.0.1:5173'
    demo_jwt_secret: str = Field(default_factory=lambda: secrets.token_urlsafe(48))
    razorpay_key_id: str = ''
    razorpay_key_secret: str = ''
    razorpay_webhook_secret: str = ''
    razorpay_test_only: bool = False  # Isolated pilot: reject live merchant keys
    mqtt_host: str = ''
    mqtt_port: int = 8883
    mqtt_username: str = ''
    mqtt_password: str = ''
    mqtt_ingest_username: str = ''
    mqtt_ingest_password: str = ''
    mqtt_ingest_client_id: str = 'hostelxpress-backend-ingest'
    mqtt_ca_file: str | None = None
    worker_enabled: bool = True
    staging_booking_user_id: UUID | None = None
    pickup_otp_secret: str = ''  # Backend-only AES-GCM/HMAC key for OTP2 and encrypted OTP1 relay
    gate_operator_token: str = ''  # Backend-only Gate 2 staff credential, NOT a courier OTP
    trusted_hosts: str = 'localhost,127.0.0.1,[::1],testserver'

    @model_validator(mode='after')
    def validate_configuration(self):
        if self.app_env not in {'demo', 'test', 'production'}:
            raise ValueError('APP_ENV must be demo, test, or production')
        if self.app_env in {'demo', 'test'}:
            host = conninfo_to_dict(self.database_url).get('host', '')
            if not (host.startswith('/') or host in {'localhost','127.0.0.1','::1',''}):
                raise ValueError('Demo/test databases must use a local Unix socket or loopback host')
            if len(self.demo_jwt_secret) < 32:
                raise ValueError('DEMO_JWT_SECRET must contain at least 32 characters')
        else:
            parsed = urlparse(self.supabase_url)
            if parsed.scheme != 'https' or not parsed.netloc or parsed.username or parsed.query:
                raise ValueError('Production requires an HTTPS SUPABASE_URL')
        if self.razorpay_test_only:
            if not self.razorpay_configured:
                raise ValueError('RAZORPAY_TEST_ONLY requires a complete TEST key pair and webhook secret')
            if not self.razorpay_key_id.startswith('rzp_test_'):
                raise ValueError('RAZORPAY_TEST_ONLY refuses live or unidentified merchant keys')
            if self.is_demo or self.staging_booking_user_id:
                raise ValueError('RAZORPAY_TEST_ONLY requires a separate, real-auth isolated sandbox')
        if self.mqtt_host and (not self.mqtt_username or not self.mqtt_password or not self.mqtt_ingest_username or not self.mqtt_ingest_password):
            raise ValueError('MQTT requires backend credentials; anonymous connections are disabled')
        if self.pickup_otp_secret and len(self.pickup_otp_secret.encode('utf-8')) < 32:
            raise ValueError('Pickup OTP2 secret requires at least 32 bytes')
        if self.gate_operator_token and len(self.gate_operator_token) < 32:
            raise ValueError('Gate operator token requires at least 32 characters')
        if (self.pickup_otp_secret or self.gate_operator_token) and (self.is_demo or self.staging_booking_user_id):
            raise ValueError('Real OTP and gate operations are disabled in demo/restricted staging mode')
        if self.staging_booking_user_id and (
            self.is_demo or self.worker_enabled or self.mqtt_host or self.razorpay_key_id
            or self.razorpay_key_secret or self.razorpay_webhook_secret
        ):
            raise ValueError('Staging bookings require Supabase Auth, with worker, MQTT and payments disabled')
        return self

    @property
    def is_demo(self) -> bool:
        return self.app_env in {'demo','test'}

    @property
    def pickup_otp_enabled(self) -> bool:
        return bool(self.pickup_otp_secret)

    @property
    def gate_operator_enabled(self) -> bool:
        return bool(self.gate_operator_token)

    @property
    def razorpay_configured(self) -> bool:
        return all(value.strip() for value in (
            self.razorpay_key_id, self.razorpay_key_secret, self.razorpay_webhook_secret
        ))

    @property
    def issuer(self) -> str:
        return self.supabase_url.rstrip('/') + '/auth/v1'


def is_loopback(host: str | None) -> bool:
    if host in {'localhost','testclient','testserver'}:
        return True
    try:
        return ipaddress.ip_address(host or '').is_loopback
    except ValueError:
        return False


@lru_cache
def get_settings() -> Settings:
    return Settings()

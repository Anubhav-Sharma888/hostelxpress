from __future__ import annotations

import ipaddress
import secrets
from functools import lru_cache
from urllib.parse import urlparse

from psycopg.conninfo import conninfo_to_dict
from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra='ignore')
    app_env: str = 'production'
    database_url: str
    supabase_url: str = ''
    cors_origins: str = 'http://localhost:8081,http://127.0.0.1:8081,http://localhost:5173,http://127.0.0.1:5173'
    demo_jwt_secret: str = Field(default_factory=lambda: secrets.token_urlsafe(48))
    razorpay_key_id: str = ''
    razorpay_key_secret: str = ''
    razorpay_webhook_secret: str = ''
    mqtt_host: str = ''
    mqtt_port: int = 8883
    mqtt_username: str = ''
    mqtt_password: str = ''
    mqtt_ingest_username: str = ''
    mqtt_ingest_password: str = ''
    mqtt_ingest_client_id: str = 'hostelxpress-backend-ingest'
    mqtt_ca_file: str | None = None
    worker_enabled: bool = True
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
        if self.mqtt_host and (not self.mqtt_username or not self.mqtt_password or not self.mqtt_ingest_username or not self.mqtt_ingest_password):
            raise ValueError('MQTT requires backend credentials; anonymous connections are disabled')
        return self

    @property
    def is_demo(self) -> bool:
        return self.app_env in {'demo','test'}

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

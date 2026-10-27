#!/usr/bin/env python3
"""Opt-in check of the operator's real Supabase project: Auth JWKS, publishable
key, and (optionally) schema/RLS/migrations plus one real token verification.

Set HOSTELXPRESS_CHECK_SUPABASE=1 and provide configuration through the
environment (or the checkout-root .env): SUPABASE_URL, optionally
SUPABASE_PUBLISHABLE_KEY, SUPABASE_DB_URL, and HOSTELXPRESS_SUPABASE_TEST_TOKEN
(a JWT minted by a real student sign-in, to verify the production auth path).
Read-only: nothing in the project is modified and no secret is printed.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]


def load_dotenv() -> None:
    """Minimal .env reader so the operator's manual credentials apply here too."""
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


def check_http(base_url: str, results: dict) -> None:
    import httpx

    parsed = urlparse(base_url)
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.query:
        raise RuntimeError("SUPABASE_URL must be a plain HTTPS origin")
    with httpx.Client(timeout=10, follow_redirects=False) as client:
        jwks_response = client.get(base_url + "/auth/v1/.well-known/jwks.json")
        if jwks_response.status_code != 200:
            raise RuntimeError(f"JWKS endpoint returned HTTP {jwks_response.status_code}")
        jwks = jwks_response.json()
        keys = jwks.get("keys") if isinstance(jwks, dict) else None
        if not keys:
            raise RuntimeError("JWKS contains no signing keys")
        algorithms = sorted({key.get("alg") for key in keys if key.get("alg")})
        results["jwks_keys"] = len(keys)
        results["jwks_algorithms"] = algorithms
        if not set(algorithms) & {"RS256", "ES256"}:
            raise RuntimeError(f"JWKS offers no asymmetric signing key: {algorithms}")
        health = client.get(base_url + "/auth/v1/health")
        results["auth_health"] = health.status_code
        if health.status_code != 200:
            raise RuntimeError("Auth service is not healthy")

        publishable = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "")
        if publishable:
            settings_response = client.get(base_url + "/auth/v1/settings",
                                           headers={"apikey": publishable, "Authorization": "Bearer " + publishable})
            results["publishable_key_accepted"] = settings_response.status_code == 200
            if settings_response.status_code == 401:
                raise RuntimeError("Supabase rejected the publishable key")
        results["provider"] = "real Supabase Auth over HTTPS"


def check_token(base_url: str, token: str, results: dict) -> None:
    import jwt
    from jwt import PyJWKClient

    jwks = PyJWKClient(base_url + "/auth/v1/.well-known/jwks.json", timeout=5)
    key = jwks.get_signing_key_from_jwt(token)
    claims = jwt.decode(token, key.key, algorithms=["RS256", "ES256"], issuer=base_url + "/auth/v1",
                        audience="authenticated", options={"require": ["sub", "iss", "aud", "exp"]})
    if claims.get("role") != "authenticated":
        raise RuntimeError("Token role is not 'authenticated'")
    results["token_subject_shape"] = "uuid" if len(str(claims.get("sub", ""))) == 36 else "unexpected"
    results["real_token_verification"] = "passed"


def check_schema(results: dict) -> None:
    import psycopg
    from psycopg.conninfo import make_conninfo

    db_url = os.environ.get("SUPABASE_DB_URL", "")
    if not db_url:
        return
    if "sslmode=" not in db_url:
        db_url = make_conninfo(db_url, sslmode="require")
    with psycopg.connect(db_url, autocommit=True) as conn:
        version = conn.execute("show server_version_num").fetchone()[0]
        results["postgres_server_version"] = version
        for table in ("users", "bots", "orders", "transactions"):
            row = conn.execute("SELECT to_regclass(%s) IS NOT NULL AS exists_, relrowsecurity FROM pg_class WHERE oid=to_regclass(%s)",
                               (f"public.{table}", f"public.{table}")).fetchone()
            if not row or not row["exists_"]:
                raise RuntimeError(f"public.{table} is missing; run supabase/init.sql first")
            if not row["relrowsecurity"]:
                raise RuntimeError(f"Row level security is not enabled on public.{table}")
        applied = [r[0] for r in conn.execute("SELECT version FROM hostelxpress_private.schema_migrations ORDER BY version").fetchall()]
        results["migrations_applied"] = applied
        required = {"0001_application_core", "0002_device_reconciliation"}
        if not required.issubset(set(applied)):
            raise RuntimeError(f"Apply the remaining migrations in supabase/migrations/: {sorted(required - set(applied))}")
        results["schema_and_rls"] = "passed"


def main() -> int:
    load_dotenv()
    if os.environ.get("HOSTELXPRESS_CHECK_SUPABASE") != "1":
        print("SKIP: set HOSTELXPRESS_CHECK_SUPABASE=1 to check the configured Supabase project.")
        return 0
    base_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    if not base_url:
        print("FAIL: set SUPABASE_URL in the environment or .env first.", file=sys.stderr)
        return 2
    results: dict = {}
    try:
        check_http(base_url, results)
        token = os.environ.get("HOSTELXPRESS_SUPABASE_TEST_TOKEN", "")
        if token:
            check_token(base_url, token, results)
        check_schema(results)
    except Exception as error:  # Operator-facing: a short reason, never a secret.
        results["error"] = type(error).__name__ + ": " + str(error)[:400]
        print(json.dumps({"check": "supabase", "result": "fail", **results}, indent=2))
        return 1
    print(json.dumps({"check": "supabase", "result": "pass", **results}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

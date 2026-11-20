"""Pure, fail-closed rider OTP challenge primitives for the Gate 2 outer lid.

This module deliberately exposes NO HTTP route and NO hardware command. Before
production use, persist each challenge in a locked private PostgreSQL row,
authenticate the code recipient and submitting device, and connect a successful
redemption to the existing safety-checked command outbox. A carrier's own OTP
cannot be verified with this module without that carrier's authorized API.
"""
from __future__ import annotations

import hashlib
import hmac
import re
import secrets
from dataclasses import dataclass, replace
from datetime import datetime, timedelta
from uuid import UUID

OTP_DIGITS = 6
OTP_MAX_ATTEMPTS = 3
OTP_LIFETIME = timedelta(minutes=5)
_FORMAT = re.compile(r"[0-9]{6}\Z", re.ASCII)


@dataclass(frozen=True)
class RiderOtpChallenge:
    """Persist this record in a PRIVATE table; never persist the raw code."""

    order_id: UUID
    bot_id: UUID
    compartment: int
    digest: str
    issued_at: datetime
    expires_at: datetime
    attempts: int = 0
    consumed_at: datetime | None = None


def _require_secret(secret: bytes) -> None:
    if not isinstance(secret, bytes) or len(secret) < 32:
        raise ValueError("Rider OTP requires an independently generated 32+ byte server secret")


def _aware(value: datetime) -> None:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("Rider OTP timestamps must have an explicit timezone")


def _digest(secret: bytes, order: UUID, bot: UUID, bay: int, code: str) -> str:
    material = f"hostelxpress-rider-otp-v1:{order}:{bot}:{bay}:{code}".encode("ascii")
    return hmac.new(secret, material, hashlib.sha256).hexdigest()


def issue(
    *, secret: bytes, order_id: UUID, bot_id: UUID, compartment: int,
    now: datetime, rider_due_at: datetime,
) -> tuple[str, RiderOtpChallenge]:
    """Issue only after caller authenticated the order's student and assignment.

    The one-time raw code is returned once for delivery through an approved,
    authenticated channel. This function does not select or message a rider.
    """
    _require_secret(secret)
    _aware(now)
    _aware(rider_due_at)
    if not 1 <= compartment <= 3:
        raise ValueError("A real, assigned compartment 1-3 is required")
    expires_at = min(now + OTP_LIFETIME, rider_due_at)
    if expires_at <= now:
        raise ValueError("The rider-loading deadline has already passed")
    code = f"{secrets.randbelow(10 ** OTP_DIGITS):0{OTP_DIGITS}d}"
    return code, RiderOtpChallenge(
        order_id=order_id, bot_id=bot_id, compartment=compartment,
        digest=_digest(secret, order_id, bot_id, compartment, code),
        issued_at=now, expires_at=expires_at,
    )


def redeem(
    challenge: RiderOtpChallenge, candidate: str, *,
    secret: bytes, order_id: UUID, bot_id: UUID, compartment: int, now: datetime,
) -> tuple[RiderOtpChallenge, bool]:
    """Return updated state and result; caller MUST persist it atomically.

    A rejected code counts as a failed attempt, including malformed input.
    A matched code may authorize the OUTER command only after verifying the
    current order, authenticated device, fresh sensors and physical interlocks.
    This function never authorizes or sends any command itself.
    """
    _require_secret(secret)
    _aware(now)
    if (order_id != challenge.order_id or bot_id != challenge.bot_id
            or compartment != challenge.compartment):
        return challenge, False
    if (now < challenge.issued_at or now >= challenge.expires_at
            or challenge.consumed_at is not None
            or challenge.attempts >= OTP_MAX_ATTEMPTS):
        return challenge, False
    normalized = candidate if isinstance(candidate, str) and _FORMAT.fullmatch(candidate) else "INVALID"
    actual = _digest(secret, order_id, bot_id, compartment, normalized)
    valid = hmac.compare_digest(challenge.digest, actual) and normalized != "INVALID"
    updated = replace(
        challenge,
        attempts=challenge.attempts + 1,
        consumed_at=now if valid else None,
    )
    return updated, valid

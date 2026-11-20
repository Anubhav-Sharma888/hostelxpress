"""Security boundary tests; no database, SMS, provider or physical rover used."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from app import rider_otp

KEY = bytes(range(32))
NOW = datetime(2026, 11, 21, 0, 0, tzinfo=timezone.utc)


@pytest.fixture
def challenge(monkeypatch):
    monkeypatch.setattr(rider_otp.secrets, "randbelow", lambda upper: 7031)
    order, bot = uuid4(), uuid4()
    raw, record = rider_otp.issue(
        secret=KEY, order_id=order, bot_id=bot, compartment=2,
        now=NOW, rider_due_at=NOW + timedelta(minutes=5),
    )
    assert raw == "007031"  # fixed six-digit width, including leading zeroes
    assert raw not in repr(record)  # no plaintext persistence
    return raw, record


def verify(record, value, when=NOW + timedelta(seconds=5), **overrides):
    return rider_otp.redeem(
        record, value, secret=overrides.pop("secret", KEY),
        order_id=overrides.pop("order_id", record.order_id),
        bot_id=overrides.pop("bot_id", record.bot_id),
        compartment=overrides.pop("compartment", record.compartment),
        now=when,
    )


def test_one_use_and_attempt_counter(challenge):
    raw, record = challenge
    used, accepted = verify(record, raw)
    assert accepted and used.consumed_at is not None and used.attempts == 1
    _, replay = verify(used, raw)
    assert not replay


def test_three_wrong_attempts_lock_out_even_correct_code(challenge):
    raw, state = challenge
    for n in range(3):
        state, valid = verify(state, "999999")
        assert not valid and state.attempts == n + 1
    final, accepted = verify(state, raw)
    assert not accepted and final == state


@pytest.mark.parametrize("candidate", ["7031", " 007031", "007031 ", "００７０３１", "٠٠٧٠٣١", "", 7031])
def test_malformed_attempt_is_counted(challenge, candidate):
    _, state = challenge
    next_state, ok = verify(state, candidate)
    assert not ok and next_state.attempts == 1


def test_order_bot_and_bay_binding_fail_closed(challenge):
    raw, state = challenge
    for kwargs in ({"order_id": uuid4()}, {"bot_id": uuid4()}, {"compartment": 1}):
        untouched, valid = verify(state, raw, **kwargs)
        assert not valid and untouched == state


def test_expiration_and_not_yet_issued(challenge):
    raw, state = challenge
    assert not verify(state, raw, when=NOW + timedelta(minutes=5))[1]
    assert not verify(state, raw, when=NOW - timedelta(seconds=1))[1]


def test_cannot_issue_past_rider_deadline(challenge):
    _, state = challenge
    with pytest.raises(ValueError):
        rider_otp.issue(secret=KEY, order_id=state.order_id, bot_id=state.bot_id,
                        compartment=2, now=NOW, rider_due_at=NOW)


def test_otp_expiry_is_shorter_of_five_minutes_and_rider_deadline(challenge):
    _, state = challenge
    _, short = rider_otp.issue(
        secret=KEY, order_id=state.order_id, bot_id=state.bot_id, compartment=2,
        now=NOW, rider_due_at=NOW + timedelta(seconds=40))
    assert short.expires_at == NOW + timedelta(seconds=40)


def test_wrong_secret_never_verifies(challenge):
    raw, state = challenge
    used, accepted = verify(state, raw, secret=bytes(reversed(KEY)))
    assert not accepted and used.attempts == 1


def test_rejects_weak_keys_invalid_bays_and_naive_clocks(challenge):
    _, state = challenge
    for kw in ({"secret": b"short"}, {"compartment": 4},
               {"now": datetime(2026, 11, 21)}):
        params = dict(secret=KEY, order_id=state.order_id, bot_id=state.bot_id,
                      compartment=2, now=NOW, rider_due_at=NOW + timedelta(minutes=5))
        params.update(kw)
        with pytest.raises(ValueError):
            rider_otp.issue(**params)

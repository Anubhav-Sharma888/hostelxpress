from __future__ import annotations

import threading
import time
from collections import defaultdict

from fastapi import HTTPException


class FailureThrottle:
    """Counts failed authentication attempts per key in a fixed window.

    Best effort and process-local: it shields the database from repeated
    unauthenticated garbage on single-process deployments, not a distributed
    abuse-control system.
    """

    def __init__(self, limit: int, window_seconds: float = 60.0, max_keys: int = 10000):
        self.limit = limit
        self.window = window_seconds
        self.max_keys = max_keys
        self._events: dict[str, list[float]] = defaultdict(list)
        self._lock = threading.Lock()

    def check(self, key: str) -> None:
        """Record a failure; raise 429 once the window holds more than `limit`."""
        if not key:
            key = 'unknown'
        now = time.monotonic()
        with self._lock:
            if len(self._events) > self.max_keys:
                for stale in [k for k, v in self._events.items() if not v or now - v[-1] >= self.window]:
                    del self._events[stale]
            recent = [stamp for stamp in self._events[key] if now - stamp < self.window]
            recent.append(now)
            self._events[key] = recent
            saturated = len(recent) > self.limit
        if saturated:
            raise HTTPException(429, 'Too many failed attempts from this address; retry later')

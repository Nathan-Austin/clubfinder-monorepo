import logging
import time


class ApiKeyRateLimiter:
    """Simple per-key rate limiter with rotation support."""

    def __init__(
        self,
        client_ids,
        requests_per_window=80,
        window_seconds=60,
        min_interval_seconds=0.2,
        time_fn=None,
        sleep_fn=None,
        logger=None,
    ):
        self.client_ids = list(client_ids)
        self.requests_per_window = requests_per_window
        self.window_seconds = window_seconds
        self.min_interval_seconds = min_interval_seconds
        self.time_fn = time_fn or time.time
        self.sleep_fn = sleep_fn or time.sleep
        self.logger = logger or logging.getLogger(__name__)
        self.current_index = 0
        self._tracking = {}

        for client_id in self.client_ids:
            self._init_tracking(client_id)

    def _init_tracking(self, client_id):
        now = self.time_fn()
        self._tracking[client_id] = {
            "count": 0,
            "start_time": now,
            "last_request": now,
        }

    def current_client_id(self):
        if not self.client_ids:
            return None
        return self.client_ids[self.current_index]

    def rotate(self):
        if not self.client_ids:
            return None
        self.current_index = (self.current_index + 1) % len(self.client_ids)
        client_id = self.current_client_id()
        if client_id not in self._tracking:
            self._init_tracking(client_id)
        return client_id

    def acquire(self):
        """Return the client ID to use for the next request."""
        if not self.client_ids:
            return None

        client_id = self.current_client_id()
        tracking = self._tracking.get(client_id)
        if tracking is None:
            self._init_tracking(client_id)
            tracking = self._tracking[client_id]

        now = self.time_fn()
        time_since_last = now - tracking["last_request"]
        if time_since_last < self.min_interval_seconds:
            self.sleep_fn(self.min_interval_seconds - time_since_last)
            now = self.time_fn()

        elapsed = now - tracking["start_time"]
        if elapsed >= self.window_seconds:
            self._init_tracking(client_id)
            tracking = self._tracking[client_id]

        if tracking["count"] >= self.requests_per_window:
            client_id = self.rotate()
            self._init_tracking(client_id)
            tracking = self._tracking[client_id]

        tracking["count"] += 1
        tracking["last_request"] = self.time_fn()
        return client_id

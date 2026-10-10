import random
from collections import deque

_MODES = ("none", "full", "equal")


class PermanentError(Exception):
    pass


# @id CODE-RET-001
# @implements REQ-RET-001, REQ-RET-002, REQ-RET-003, REQ-RET-004, REQ-RET-005
def backoff(attempt, base, cap, mode="none", seed=None):
    if attempt < 1 or base <= 0 or cap <= 0 or cap < base or mode not in _MODES:
        raise ValueError("invalid backoff arguments")
    exp = min(attempt - 1, 1000)
    ceiling = min(cap, base * 2.0**exp)
    if mode == "none":
        return ceiling
    r = random.Random(seed).random()
    if mode == "full":
        return r * ceiling
    return ceiling / 2 + r * ceiling / 2


# @id CODE-RET-002
# @implements REQ-RET-006
def should_retry(attempt, max_attempts, error):
    if attempt >= max_attempts:
        return False
    return not isinstance(error, PermanentError)


# @id CODE-RET-003
# @implements REQ-RET-009
def total_delay(max_attempts, base, cap):
    return sum(backoff(a, base, cap) for a in range(1, max_attempts))


# @id CODE-RET-004
# @implements REQ-RET-007
class RetryBudget:
    def __init__(self, capacity, ratio):
        self.capacity = float(capacity)
        self.ratio = float(ratio)
        self.tokens = float(capacity)

    def consume(self):
        if self.tokens >= 1:
            self.tokens -= 1
            return True
        return False

    def on_success(self):
        self.tokens = min(self.capacity, self.tokens + self.ratio)


# @id CODE-RET-005
# @implements REQ-RET-008
class DeadLetterQueue:
    def __init__(self, capacity):
        self._items = deque(maxlen=capacity)

    def add(self, job_id, attempts, error):
        self._items.append({"job_id": job_id, "attempts": attempts, "error": error})

    def entries(self):
        return list(self._items)

    def __len__(self):
        return len(self._items)

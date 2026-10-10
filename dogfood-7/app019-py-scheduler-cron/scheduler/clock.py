from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
import heapq
import math


def utc(value):
    if not isinstance(value, datetime) or value.utcoffset() is None:
        raise ValueError("instant must be timezone-aware")
    return value.astimezone(timezone.utc)


def duration(value, positive=False):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError("duration must be finite")
    if value < 0 or (positive and value == 0):
        raise ValueError("invalid duration")
    return timedelta(seconds=value)


@dataclass
class FakeClock:
    instant: datetime
    events: list = field(default_factory=list)
    active: set = field(default_factory=set)
    sequence: int = 0
    advancing: bool = False


# @id CODE-CLOCK-001 @implements REQ-CLOCK-001
def create_clock(start):
    return FakeClock(utc(start))


# @id CODE-CLOCK-002 @implements REQ-CLOCK-002
def now(clock):
    return clock.instant


# @id CODE-CLOCK-003 @implements REQ-CLOCK-003 REQ-CLOCK-004 REQ-CLOCK-006 REQ-CLOCK-007 REQ-CLOCK-008 REQ-CLOCK-002
def advance(clock, seconds, budget=10000):
    target = clock.instant + duration(seconds)
    if isinstance(budget, bool) or not isinstance(budget, int) or budget <= 0 or clock.advancing:
        raise ValueError("invalid or reentrant advance")
    clock.advancing = True
    count = 0
    try:
        while clock.events and clock.events[0][0] <= target:
            deadline, token, callback = clock.events[0]
            if token not in clock.active:
                heapq.heappop(clock.events)
                continue
            if count >= budget:
                raise RuntimeError("callback budget exceeded")
            heapq.heappop(clock.events)
            clock.active.remove(token)
            clock.instant = deadline
            count += 1
            callback()
        clock.instant = target
    finally:
        clock.advancing = False


# @id CODE-CLOCK-004 @implements REQ-CLOCK-003 REQ-CLOCK-004 REQ-CLOCK-006 REQ-CLOCK-008
def schedule(clock, deadline, callback):
    deadline = utc(deadline)
    if deadline < clock.instant or not callable(callback):
        raise ValueError("invalid callback deadline")
    clock.sequence += 1
    token = clock.sequence
    heapq.heappush(clock.events, (deadline, token, callback))
    clock.active.add(token)
    return token


# @id CODE-CLOCK-005 @implements REQ-CLOCK-005
def cancel(clock, token):
    if token not in clock.active:
        return False
    clock.active.remove(token)
    return True

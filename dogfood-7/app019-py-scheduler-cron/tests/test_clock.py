from datetime import datetime, timedelta, timezone
import pytest
from scheduler.clock import create_clock, now, advance, schedule, cancel

START = datetime(2026, 1, 1, tzinfo=timezone.utc)

# @id TEST-CLOCK-001 @verifies REQ-CLOCK-001
def test_clock_001():
    assert now(create_clock(START)) == START
    with pytest.raises(ValueError):
        create_clock(START.replace(tzinfo=None))

# @id TEST-CLOCK-002 @verifies REQ-CLOCK-002
def test_clock_002():
    c = create_clock(START)
    advance(c, 5)
    assert now(c) == START + timedelta(seconds=5)
    with pytest.raises(ValueError):
        advance(c, -1)
    assert now(c) == START + timedelta(seconds=5)

# @id TEST-CLOCK-003 @verifies REQ-CLOCK-003
def test_clock_003():
    c = create_clock(START)
    seen = []
    schedule(c, START + timedelta(seconds=2), lambda: seen.append(now(c)))
    schedule(c, START + timedelta(seconds=1), lambda: seen.append(now(c)))
    advance(c, 3)
    assert seen == [START + timedelta(seconds=1), START + timedelta(seconds=2)]
    assert now(c) == START + timedelta(seconds=3)

# @id TEST-CLOCK-004 @verifies REQ-CLOCK-004
def test_clock_004():
    c = create_clock(START)
    seen = []
    for i in range(3):
        schedule(c, START, lambda i=i: seen.append(i))
    advance(c, 0)
    assert seen == [0, 1, 2]

# @id TEST-CLOCK-005 @verifies REQ-CLOCK-005
def test_clock_005():
    c = create_clock(START)
    seen = []
    token = schedule(c, START, lambda: seen.append(1))
    assert cancel(c, token)
    assert not cancel(c, token)
    advance(c, 0)
    assert seen == []

# @id TEST-CLOCK-006 @verifies REQ-CLOCK-006
def test_clock_006():
    c = create_clock(START)
    seen = []
    def callback():
        seen.append(1)
        schedule(c, now(c), lambda: seen.append(2))
    schedule(c, START, callback)
    advance(c, 0)
    assert seen == [1, 2]

# @id TEST-CLOCK-007 @verifies REQ-CLOCK-007
def test_clock_007():
    c = create_clock(START)
    seen = []
    def fail():
        raise RuntimeError("callback failure")
    schedule(c, START + timedelta(seconds=1), fail)
    schedule(c, START + timedelta(seconds=2), lambda: seen.append(2))
    with pytest.raises(RuntimeError, match="callback failure"):
        advance(c, 3)
    assert now(c) == START + timedelta(seconds=1)
    advance(c, 2)
    assert seen == [2]

# @id TEST-CLOCK-008 @verifies REQ-CLOCK-008
def test_clock_008():
    c = create_clock(START)
    with pytest.raises(ValueError):
        schedule(c, START - timedelta(seconds=1), lambda: None)
    def loop():
        schedule(c, now(c), loop)
    schedule(c, START, loop)
    with pytest.raises(RuntimeError, match="budget"):
        advance(c, 0, budget=4)

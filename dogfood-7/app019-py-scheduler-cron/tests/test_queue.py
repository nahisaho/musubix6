from datetime import datetime, timedelta, timezone
import pytest
from scheduler.queue import create_queue, push, pop, discard, size

START = datetime(2026, 1, 1, tzinfo=timezone.utc)

# @id TEST-QUEUE-001 @verifies REQ-QUEUE-001
def test_queue_001():
    q = create_queue()
    push(q, "low", START, 1, {"x": 1})
    push(q, "high", START, 9, {"x": 2})
    assert pop(q, START).id == "high"
    assert pop(q, START).payload == {"x": 1}

# @id TEST-QUEUE-002 @verifies REQ-QUEUE-002
def test_queue_002():
    q = create_queue()
    push(q, "later", START + timedelta(seconds=1), 1)
    push(q, "first", START, 1)
    push(q, "second", START, 1)
    assert [pop(q, START + timedelta(seconds=2)).id for _ in range(3)] == ["first", "second", "later"]

# @id TEST-QUEUE-003 @verifies REQ-QUEUE-003
def test_queue_003():
    q = create_queue()
    push(q, "future", START + timedelta(seconds=10), 99)
    push(q, "ready", START, 1)
    assert pop(q, START).id == "ready"
    assert pop(q, START) is None
    assert pop(q, START + timedelta(seconds=10)).id == "future"

# @id TEST-QUEUE-004 @verifies REQ-QUEUE-004
def test_queue_004():
    q = create_queue()
    assert push(q, "a", START, 1, "original")
    assert not push(q, "a", START, 99, "replacement")
    assert pop(q, START).payload == "original"

# @id TEST-QUEUE-005 @verifies REQ-QUEUE-005
def test_queue_005():
    q = create_queue()
    push(q, "a", START)
    assert discard(q, "a")
    assert not discard(q, "a")
    assert pop(q, START) is None

# @id TEST-QUEUE-006 @verifies REQ-QUEUE-006
def test_queue_006():
    q = create_queue()
    push(q, "a", START + timedelta(seconds=10), 99)
    discard(q, "a")
    push(q, "a", START, 1, "new")
    assert pop(q, START).payload == "new"
    assert pop(q, START + timedelta(seconds=20)) is None

# @id TEST-QUEUE-007 @verifies REQ-QUEUE-007
def test_queue_007():
    q = create_queue()
    push(q, "a", START)
    push(q, "b", START + timedelta(seconds=10))
    assert size(q) == 2
    pop(q, START)
    assert size(q) == 1
    discard(q, "b")
    assert size(q) == 0

# @id TEST-QUEUE-008 @verifies REQ-QUEUE-008
def test_queue_008():
    q = create_queue()
    for args in [("", START, 0), ("a", START.replace(tzinfo=None), 0), ("a", START, "high"), ("a", START, True)]:
        with pytest.raises(ValueError):
            push(q, *args)
    assert size(q) == 0

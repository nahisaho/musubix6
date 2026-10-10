from datetime import datetime, timedelta, timezone
import pytest
from scheduler.clock import create_clock, advance
from scheduler.dispatch import create_scheduler, submit, poll, complete, cancel_job, retry_delay

START = datetime(2026, 1, 1, tzinfo=timezone.utc)

# @id TEST-DISPATCH-001 @verifies REQ-DISPATCH-001
def test_dispatch_001():
    s = create_scheduler(create_clock(START))
    submit(s, "job", START)
    run = poll(s, "worker")
    assert run.id == "job" and run.attempt == 1 and run.lease.owner == "worker"
    assert poll(s, "other") is None

# @id TEST-DISPATCH-002 @verifies REQ-DISPATCH-002
def test_dispatch_002():
    s = create_scheduler(create_clock(START))
    submit(s, "job", START)
    run = poll(s, "a")
    assert complete(s, run, True)
    assert s.jobs["job"].state == "succeeded"
    assert not complete(s, run, True)
    assert poll(s, "a") is None

# @id TEST-DISPATCH-003 @verifies REQ-DISPATCH-003
def test_dispatch_003():
    c = create_clock(START)
    s = create_scheduler(c)
    submit(s, "job", START, max_attempts=4, base_delay=2, max_delay=3)
    first = poll(s, "a")
    assert complete(s, first, False)
    assert poll(s, "a") is None
    advance(c, 2)
    second = poll(s, "a")
    assert second.attempt == 2
    complete(s, second, False)
    advance(c, 2)
    assert poll(s, "a") is None
    advance(c, 1)
    assert poll(s, "a").attempt == 3
    assert [retry_delay(i, 2, 3) for i in (1, 2, 3)] == [2, 3, 3]

# @id TEST-DISPATCH-004 @verifies REQ-DISPATCH-004
def test_dispatch_004():
    for permanent in (True, False):
        s = create_scheduler(create_clock(START))
        submit(s, "job", START, max_attempts=3 if permanent else 1)
        run = poll(s, "a")
        assert complete(s, run, False, permanent=permanent)
        assert s.jobs["job"].state == "dead"
        assert poll(s, "b") is None
        assert not cancel_job(s, "job")
    c = create_clock(START)
    s = create_scheduler(c, ttl=1)
    submit(s, "lost", START, max_attempts=1)
    poll(s, "a")
    advance(c, 1)
    assert poll(s, "b") is None
    assert s.jobs["lost"].state == "dead"

# @id TEST-DISPATCH-005 @verifies REQ-DISPATCH-005
def test_dispatch_005():
    c = create_clock(START)
    s = create_scheduler(c, ttl=5)
    submit(s, "job", START)
    old = poll(s, "a")
    advance(c, 5)
    new = poll(s, "b")
    assert new.attempt == 2 and new.lease.token > old.lease.token
    assert not complete(s, old, True)
    assert complete(s, new, True)

# @id TEST-DISPATCH-006 @verifies REQ-DISPATCH-006
def test_dispatch_006():
    c = create_clock(START)
    s = create_scheduler(c)
    submit(s, "job", START, cron="*/5 * * * *")
    run = poll(s, "a")
    advance(c, 601)
    assert complete(s, run, True) is False
    recovered = poll(s, "b")
    assert complete(s, recovered, True)
    assert s.jobs["job"].due == datetime(2026, 1, 1, 0, 15, tzinfo=timezone.utc)
    assert poll(s, "a") is None
    advance(c, 299)
    assert poll(s, "a").attempt == 1

# @id TEST-DISPATCH-007 @verifies REQ-DISPATCH-007
def test_dispatch_007():
    s = create_scheduler(create_clock(START))
    submit(s, "pending", START)
    assert cancel_job(s, "pending")
    assert not cancel_job(s, "pending")
    assert poll(s, "a") is None
    submit(s, "running", START)
    run = poll(s, "a")
    assert cancel_job(s, "running")
    assert not complete(s, run, True)
    assert s.jobs["running"].state == "cancelled"
    submit(s, "done", START)
    assert complete(s, poll(s, "a"), True)
    assert not cancel_job(s, "done")

# @id TEST-DISPATCH-008 @verifies REQ-DISPATCH-008
def test_dispatch_008():
    s = create_scheduler(create_clock(START))
    submit(s, "job", START)
    for kwargs in [{"max_attempts": 0}, {"base_delay": -1}, {"max_delay": -1}, {"cron": "bad"}, {"zone": "Invalid/Zone"}]:
        with pytest.raises(ValueError):
            submit(s, "other", START, **kwargs)
    with pytest.raises(ValueError):
        submit(s, "job", START)
    assert len(s.jobs) == 1

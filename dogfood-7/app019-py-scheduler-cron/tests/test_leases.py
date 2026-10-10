from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from datetime import datetime, timedelta, timezone
import pytest
from scheduler.clock import create_clock, advance
from scheduler.leases import create_store, acquire, renew, release, valid

START = datetime(2026, 1, 1, tzinfo=timezone.utc)

# @id TEST-LEASES-001 @verifies REQ-LEASES-001
def test_leases_001():
    s = create_store(create_clock(START))
    lease = acquire(s, "job", "worker", 10)
    assert (lease.key, lease.owner, lease.token, lease.expires) == ("job", "worker", 1, START + timedelta(seconds=10))

# @id TEST-LEASES-002 @verifies REQ-LEASES-002
def test_leases_002():
    s = create_store(create_clock(START))
    assert acquire(s, "job", "a", 10) is not None
    assert acquire(s, "job", "a", 10) is None
    assert acquire(s, "job", "b", 10) is None

# @id TEST-LEASES-003 @verifies REQ-LEASES-003
def test_leases_003():
    c = create_clock(START)
    s = create_store(c)
    old = acquire(s, "job", "a", 10)
    advance(c, 10)
    new = acquire(s, "job", "b", 10)
    assert new.token > old.token
    assert not valid(s, old)

# @id TEST-LEASES-004 @verifies REQ-LEASES-004
def test_leases_004():
    c = create_clock(START)
    s = create_store(c)
    lease = acquire(s, "job", "a", 10)
    advance(c, 5)
    updated = renew(s, lease, 20)
    assert updated.expires == START + timedelta(seconds=25)
    assert updated.token == lease.token

# @id TEST-LEASES-005 @verifies REQ-LEASES-005
def test_leases_005():
    from dataclasses import replace
    c = create_clock(START)
    s = create_store(c)
    lease = acquire(s, "job", "a", 10)
    for stale in [replace(lease, owner="b"), replace(lease, token=99)]:
        assert not valid(s, stale)
        assert renew(s, stale, 10) is None
    assert renew(s, lease, 10) is not None
    assert valid(s, lease)
    advance(c, 10)
    assert renew(s, lease, 10) is None
    assert not valid(s, lease)

# @id TEST-LEASES-006 @verifies REQ-LEASES-006
def test_leases_006():
    from dataclasses import replace
    s = create_store(create_clock(START))
    lease = acquire(s, "job", "a", 10)
    assert not release(s, replace(lease, owner="b"))
    assert release(s, lease)
    assert not release(s, lease)
    assert acquire(s, "job", "b", 10).token > lease.token

# @id TEST-LEASES-007 @verifies REQ-LEASES-007
def test_leases_007():
    s = create_store(create_clock(START))
    for args in [("", "a", 10), ("job", "", 10), ("job", "a", 0), ("job", "a", -1)]:
        with pytest.raises(ValueError):
            acquire(s, *args)
    assert acquire(s, "job", "a", 10).token == 1

# @id TEST-LEASES-008 @verifies REQ-LEASES-008
def test_leases_008():
    s = create_store(create_clock(START))
    barrier = Barrier(8)
    def worker(i):
        barrier.wait()
        return acquire(s, "job", str(i), 10)
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(worker, range(8)))
    assert sum(result is not None for result in results) == 1

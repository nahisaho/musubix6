import pytest
from wf.retry.clock import FakeClock
from wf.retry.policy import RetryPolicy, no_retry_policy
from wf.retry.runner import RetriesExhausted, run_with_retry


def flaky(fail_times, exc=RuntimeError):
    state = {"calls": 0}

    def fn():
        state["calls"] += 1
        if state["calls"] <= fail_times:
            raise exc("boom%d" % state["calls"])
        return "ok"

    fn.state = state
    return fn


# @id TEST-RETRY-001
# @verifies REQ-RETRY-001
def test_retry_001_fake_clock_advances():
    c = FakeClock(10.0)
    assert c.now() == 10.0
    c.sleep(2.5)
    assert c.now() == 12.5


# @id TEST-RETRY-002
# @verifies REQ-RETRY-002
def test_retry_002_negative_sleep():
    c = FakeClock(0)
    with pytest.raises(ValueError):
        c.sleep(-1)
    assert c.now() == 0


# @id TEST-RETRY-003
# @verifies REQ-RETRY-003
def test_retry_003_exponential_delay():
    p = RetryPolicy(base=1.0, factor=2.0, max_delay=100.0, max_attempts=5)
    assert [p.delay(n) for n in (1, 2, 3, 4)] == [1.0, 2.0, 4.0, 8.0]


# @id TEST-RETRY-004
# @verifies REQ-RETRY-004
def test_retry_004_delay_capped():
    p = RetryPolicy(base=1.0, factor=10.0, max_delay=50.0, max_attempts=5)
    assert p.delay(3) == 50.0
    assert p.delay(2) == 10.0


# @id TEST-RETRY-005
# @verifies REQ-RETRY-005
def test_retry_005_should_retry():
    p = RetryPolicy(base=1, factor=2, max_delay=9, max_attempts=3)
    assert [p.should_retry(n) for n in (1, 2, 3, 4)] == [True, True, False, False]


# @id TEST-RETRY-006
# @verifies REQ-RETRY-006
def test_retry_006_success_after_failures_sleeps_on_clock():
    c = FakeClock(0)
    p = RetryPolicy(base=1.0, factor=2.0, max_delay=100.0, max_attempts=5)
    fn = flaky(2)
    assert run_with_retry(fn, p, c) == "ok"
    assert fn.state["calls"] == 3
    assert c.now() == 1.0 + 2.0


# @id TEST-RETRY-007
# @verifies REQ-RETRY-007
def test_retry_007_exhausted():
    c = FakeClock(0)
    p = RetryPolicy(base=1.0, factor=2.0, max_delay=100.0, max_attempts=3)
    fn = flaky(99)
    with pytest.raises(RetriesExhausted) as ei:
        run_with_retry(fn, p, c)
    assert ei.value.attempts == 3
    assert str(ei.value.last_error) == "boom3"
    assert c.now() == 3.0


# @id TEST-RETRY-008
# @verifies REQ-RETRY-008
def test_retry_008_non_retryable_propagates():
    c = FakeClock(0)
    p = RetryPolicy(base=1, factor=2, max_delay=9, max_attempts=5, retry_on=(KeyError,))
    fn = flaky(1, exc=ValueError)
    with pytest.raises(ValueError):
        run_with_retry(fn, p, c)
    assert c.now() == 0
    assert fn.state["calls"] == 1


# @id TEST-RETRY-009
# @verifies REQ-RETRY-009
def test_retry_009_on_retry_callback():
    c = FakeClock(0)
    p = RetryPolicy(base=1.0, factor=3.0, max_delay=100.0, max_attempts=5)
    seen = []
    run_with_retry(flaky(2), p, c, on_retry=lambda a, e, d: seen.append((a, str(e), d)))
    assert seen == [(1, "boom1", 1.0), (2, "boom2", 3.0)]


# @id TEST-RETRY-010
# @verifies REQ-RETRY-010
def test_retry_010_no_retry_policy():
    p = no_retry_policy()
    assert p.max_attempts == 1
    assert p.should_retry(1) is False
    with pytest.raises(RetriesExhausted) as ei:
        run_with_retry(flaky(5), p, FakeClock(0))
    assert ei.value.attempts == 1

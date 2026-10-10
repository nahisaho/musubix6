import pytest
from worker.retry import backoff, should_retry, total_delay, RetryBudget, DeadLetterQueue, PermanentError


# @id TEST-RET-001
# @verifies REQ-RET-001
def test_ret_001_exponential_capped():
    assert backoff(1, 1.0, 60.0, mode="none") == 1.0
    assert backoff(2, 1.0, 60.0, mode="none") == 2.0
    assert backoff(5, 1.0, 60.0, mode="none") == 16.0
    assert backoff(7, 1.0, 60.0, mode="none") == 60.0
    assert backoff(3, 0.5, 100.0, mode="none") == 2.0


# @id TEST-RET-002
# @verifies REQ-RET-002
def test_ret_002_invalid_args():
    for args in [(0, 1, 10), (-1, 1, 10), (1, 0, 10), (1, 1, 0), (1, 5, 2)]:
        with pytest.raises(ValueError):
            backoff(*args)
    with pytest.raises(ValueError):
        backoff(1, 1, 10, mode="bogus")


# @id TEST-RET-003
# @verifies REQ-RET-003
def test_ret_003_huge_attempt():
    assert backoff(100000, 1.0, 300.0, mode="none") == 300.0
    assert backoff(10**9, 2.0, 5.0, mode="none") == 5.0


# @id TEST-RET-004
# @verifies REQ-RET-004
def test_ret_004_full_jitter():
    vals = [backoff(a, 1.0, 60.0, mode="full", seed=42) for a in range(1, 8)]
    assert vals == [backoff(a, 1.0, 60.0, mode="full", seed=42) for a in range(1, 8)]
    for a, v in zip(range(1, 8), vals):
        assert 0 <= v <= min(60.0, 2 ** (a - 1))
    assert vals != [backoff(a, 1.0, 60.0, mode="full", seed=43) for a in range(1, 8)]


# @id TEST-RET-005
# @verifies REQ-RET-005
def test_ret_005_equal_jitter():
    for seed in range(20):
        v = backoff(4, 1.0, 60.0, mode="equal", seed=seed)
        assert 4.0 <= v <= 8.0


# @id TEST-RET-006
# @verifies REQ-RET-006
def test_ret_006_should_retry():
    assert should_retry(1, 3, RuntimeError("x")) is True
    assert should_retry(2, 3, RuntimeError("x")) is True
    assert should_retry(3, 3, RuntimeError("x")) is False
    assert should_retry(1, 3, PermanentError("no")) is False
    assert should_retry(5, 3, RuntimeError("x")) is False


# @id TEST-RET-007
# @verifies REQ-RET-007
def test_ret_007_budget():
    b = RetryBudget(capacity=2.0, ratio=0.5)
    assert b.consume() is True
    assert b.consume() is True
    assert b.consume() is False
    b.on_success()
    assert b.consume() is False  # 0.5 < 1
    b.on_success()
    assert b.consume() is True  # 1.0
    for _ in range(10):
        b.on_success()
    assert b.tokens == 2.0


# @id TEST-RET-008
# @verifies REQ-RET-008
def test_ret_008_dlq_eviction():
    q = DeadLetterQueue(capacity=2)
    q.add("a", 3, "e1")
    q.add("b", 3, "e2")
    q.add("c", 2, "e3")
    assert [e["job_id"] for e in q.entries()] == ["b", "c"]
    assert len(q) == 2
    assert q.entries()[1] == {"job_id": "c", "attempts": 2, "error": "e3"}


# @id TEST-RET-009
# @verifies REQ-RET-009
def test_ret_009_total_delay():
    assert total_delay(1, 1.0, 60.0) == 0.0
    assert total_delay(4, 1.0, 60.0) == 1.0 + 2.0 + 4.0
    assert total_delay(10, 1.0, 10.0) == 1 + 2 + 4 + 8 + 10 * 5

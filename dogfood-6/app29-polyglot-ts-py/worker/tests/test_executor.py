import pytest
from worker.executor import Executor, JobRecord
from worker.retry import PermanentError, RetryBudget, DeadLetterQueue
from worker.states import can_transition


class Clock:
    def __init__(self):
        self.t = 0.0
        self.slept = []

    def now(self):
        return self.t

    def sleep(self, s):
        self.slept.append(s)
        self.t += s


def make(**kw):
    c = Clock()
    ex = Executor(clock=c.now, sleep=c.sleep, base=1.0, cap=60.0, timeout=10.0, **kw)
    return ex, c


def job(t="t", max_attempts=3, jid="j1"):
    return JobRecord(id=jid, type=t, payload={"n": 1}, max_attempts=max_attempts)


def boom(ctx, payload):
    raise RuntimeError("boom")


# @id TEST-EXE-001
# @verifies REQ-EXE-001
def test_exe_001_register():
    ex, _ = make()
    ex.register("t", lambda ctx, p: 1)
    with pytest.raises(ValueError):
        ex.register("t", lambda ctx, p: 2)
    assert ex.run_attempt(job()).result == 1


# @id TEST-EXE-002
# @verifies REQ-EXE-002
def test_exe_002_no_handler():
    ex, _ = make()
    r = ex.run_attempt(job("missing"))
    assert r.state == "dead"
    assert r.reason == "no_handler"


# @id TEST-EXE-003
# @verifies REQ-EXE-003
def test_exe_003_success():
    ex, _ = make()
    ex.register("t", lambda ctx, p: p["n"] + 1)
    r = ex.run_attempt(job())
    assert (r.state, r.result, r.attempts, r.reason) == ("succeeded", 2, 1, "ok")


# @id TEST-EXE-004
# @verifies REQ-EXE-004
def test_exe_004_transient_retry_delay():
    ex, _ = make()
    ex.register("t", boom)
    j = job()
    r = ex.run_attempt(j)
    assert (r.state, r.attempts, r.delay, r.reason) == ("retrying", 1, 1.0, "error")
    r = ex.run_attempt(j)
    assert (r.state, r.attempts, r.delay) == ("retrying", 2, 2.0)


# @id TEST-EXE-005
# @verifies REQ-EXE-005
def test_exe_005_permanent():
    ex, _ = make()

    def perm(ctx, p):
        raise PermanentError("bad input")

    ex.register("t", perm)
    r = ex.run_attempt(job())
    assert (r.state, r.reason, r.attempts) == ("dead", "permanent", 1)


# @id TEST-EXE-006
# @verifies REQ-EXE-006
def test_exe_006_exhausted_dlq():
    dlq = DeadLetterQueue(capacity=5)
    ex, _ = make(dlq=dlq)
    ex.register("t", boom)
    j = job(max_attempts=2)
    ex.run_attempt(j)
    r = ex.run_attempt(j)
    assert (r.state, r.reason, r.attempts) == ("dead", "exhausted", 2)
    assert dlq.entries() == [{"job_id": "j1", "attempts": 2, "error": "boom"}]


# @id TEST-EXE-007
# @verifies REQ-EXE-007
def test_exe_007_timeout():
    ex, c = make()

    def slow(ctx, p):
        c.t += 11.0
        ctx.check()
        return "never"

    ex.register("t", slow)
    r = ex.run_attempt(job())
    assert (r.state, r.reason) == ("retrying", "timeout")
    ex2, c2 = make()

    def fast(ctx, p):
        c2.t += 10.0
        ctx.check()
        return "ok"

    ex2.register("t", fast)
    assert ex2.run_attempt(job()).state == "succeeded"


# @id TEST-EXE-008
# @verifies REQ-EXE-008
def test_exe_008_cancel():
    ex, _ = make()

    def work(ctx, p):
        ex.cancel("j1")
        ctx.check()
        return 1

    ex.register("t", work)
    r = ex.run_attempt(job())
    assert (r.state, r.reason, r.delay) == ("cancelled", "cancelled", None)
    ex2, _ = make()
    ex2.register("t", lambda ctx, p: 1)
    ex2.cancel("j1")
    assert ex2.run_attempt(job()).state == "cancelled"


# @id TEST-EXE-009
# @verifies REQ-EXE-009
def test_exe_009_history_valid():
    ex, _ = make()
    ex.register("t", boom)
    j = job(max_attempts=3)
    ex.run_until_done(j)
    assert j.history[0] == "queued"
    assert j.history[-1] == "dead"
    for a, b in zip(j.history, j.history[1:]):
        assert can_transition(a, b)
    assert j.history == ["queued", "running", "failed", "retrying", "running", "failed", "retrying", "running", "failed", "dead"]


# @id TEST-EXE-010
# @verifies REQ-EXE-010
def test_exe_010_budget_exhausted():
    ex, _ = make(budget=RetryBudget(capacity=1.0, ratio=0.1))
    ex.register("t", boom)
    a, b = job(jid="a"), job(jid="b")
    assert ex.run_attempt(a).state == "retrying"
    r = ex.run_attempt(b)
    assert (r.state, r.reason) == ("dead", "budget_exhausted")


# @id TEST-EXE-011
# @verifies REQ-EXE-011
def test_exe_011_run_until_done():
    ex, c = make()
    calls = []

    def flaky(ctx, p):
        calls.append(1)
        if len(calls) < 3:
            raise RuntimeError("again")
        return "done"

    ex.register("t", flaky)
    r = ex.run_until_done(job(max_attempts=5))
    assert (r.state, r.result, r.attempts) == ("succeeded", "done", 3)
    assert c.slept == [1.0, 2.0]


# @id TEST-EXE-012
# @verifies REQ-EXE-012
def test_exe_012_every_dead_is_dead_lettered():
    dlq = DeadLetterQueue(capacity=10)
    ex, _ = make(dlq=dlq, budget=RetryBudget(capacity=1.0, ratio=0.0))

    def perm(ctx, p):
        raise PermanentError("bad input")

    ex.register("perm", perm)
    ex.register("t", boom)
    ex.run_attempt(job("perm", jid="p"))
    ex.run_attempt(job("none", jid="n"))
    ex.run_attempt(job("t", jid="a"))
    ex.run_attempt(job("t", jid="b"))
    assert [(e["job_id"], e["error"]) for e in dlq.entries()] == [("p", "bad input"), ("n", "no_handler"), ("b", "boom")]

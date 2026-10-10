import pytest
from actor_runtime.scheduler import Runtime

# @id TEST-SCHEDULER-001 @verifies REQ-SCHEDULER-001 REQ-SCHEDULER-002 REQ-SCHEDULER-003 REQ-SCHEDULER-004 REQ-SCHEDULER-005 REQ-SCHEDULER-006 REQ-SCHEDULER-007 REQ-SCHEDULER-008
def test_scheduler_001_contract():
    runtime = Runtime()
    log = []
    def handle(rt, name, message):
        log.append((name, message))
        if message == "again":
            rt.send(name, "later")
    runtime.spawn("a", handle)
    runtime.spawn("b", handle)
    with pytest.raises(ValueError):
        runtime.spawn("a", handle)
    assert not runtime.send("unknown", 1)
    for name in ["a", "b"]:
        assert runtime.send(name, 1)
        assert runtime.send(name, 2)
    assert runtime.step()
    assert log == [("a", 1)] and runtime.tick == 1
    assert runtime.run(2) == 2
    assert log == [("a", 1), ("b", 1), ("a", 2)]
    assert runtime.actors["b"].mailbox.size == 1
    assert runtime.run(10) == 1
    assert runtime.trace == log
    assert not runtime.step()
    assert runtime.send("a", "again")
    assert runtime.run(1) == 1
    assert runtime.actors["a"].mailbox.size == 1
    runtime.stop("a")
    assert runtime.actors["a"].mailbox.size == 0
    assert not runtime.send("a", "stopped")
    assert runtime.run(10) == 0

# @id TEST-SCHEDULER-002 @verifies REQ-SCHEDULER-009
def test_scheduler_002_spawn_during_turn():
    runtime = Runtime()
    seen = []
    def handler(rt, name, message):
        seen.append((name, message))
        if message == 1:
            rt.spawn("b", lambda inner, actor, payload: seen.append((actor, payload)))
            rt.send("b", 3)
    runtime.spawn("a", handler)
    runtime.send("a", 1)
    runtime.send("a", 2)
    runtime.run(3)
    assert seen == [("a", 1), ("b", 3), ("a", 2)]

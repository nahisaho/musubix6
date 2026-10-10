import pytest
from actor_runtime.scheduler import Runtime
from actor_runtime.supervision import Supervisor

# @id TEST-SUPERVISION-001 @verifies REQ-SUPERVISION-001 REQ-SUPERVISION-002 REQ-SUPERVISION-003 REQ-SUPERVISION-004 REQ-SUPERVISION-005 REQ-SUPERVISION-006 REQ-SUPERVISION-007 REQ-SUPERVISION-008
@pytest.mark.parametrize("strategy,expected", [
    ("one-for-one", [1, 2, 1]),
    ("one-for-all", [2, 2, 2]),
    ("rest-for-one", [1, 2, 2]),
])
def test_supervision_001_contract(strategy, expected):
    rt = Runtime()
    generations = [0, 0, 0]
    log = []
    def factory(index):
        def create():
            generations[index] += 1
            generation = generations[index]
            def handler(runtime, name, message):
                if message == "fail":
                    raise RuntimeError("actor failure")
                log.append((name, generation, message))
            return handler
        return create
    sup = Supervisor(rt, strategy, max_restarts=1, window=10)
    for index, name in enumerate(["a", "b", "c"]):
        sup.add_actor(name, factory(index))
    rt.send("b", "fail")
    rt.send("b", "queued")
    assert rt.run(1) == 1
    assert generations == expected
    assert rt.run(1) == 1
    assert log == [("b", 2, "queued")]
    rt.send("b", "fail")
    rt.run(1)
    assert sup.exhausted
    assert all(actor.state == "stopped" for actor in rt.actors.values())
    for kwargs in [{"strategy": "unknown"}, {"max_restarts": -1}, {"window": -1}]:
        with pytest.raises(ValueError):
            Supervisor(Runtime(), **kwargs)
    tree = Runtime()
    parent = Supervisor(tree, "one-for-one", max_restarts=2)
    child = Supervisor(tree, "one-for-one", max_restarts=0)
    parent.add_supervisor("subtree", child)
    child.add_actor("leaf", factory(0))
    tree.send("leaf", "fail")
    tree.send("leaf", "survives")
    tree.run(1)
    assert not child.exhausted
    assert tree.actors["leaf"].state == "alive"
    assert tree.run(1) == 1
    assert log[-1][2] == "survives"

# @id TEST-SUPERVISION-002 @verifies REQ-SUPERVISION-009
def test_supervision_002_restart_unblocks():
    runtime = Runtime()
    seen = []
    supervisor = Supervisor(runtime)
    supervisor.add_actor("worker", lambda: lambda rt, name, msg: seen.append(msg))
    runtime.send("worker", "pending")
    runtime.block("worker")
    supervisor.failed("worker")
    assert runtime.run(1) == 1
    assert seen == ["pending"]

# @id TEST-SUPERVISION-003 @verifies REQ-SUPERVISION-010
def test_supervision_003_recreate_stopped_sibling():
    runtime = Runtime()
    supervisor = Supervisor(runtime, "one-for-all")
    seen = []
    for name in ["a", "b"]:
        supervisor.add_actor(name, lambda: lambda rt, actor, msg: seen.append((actor, msg)))
    runtime.stop("b")
    supervisor.failed("a")
    assert runtime.send("b", "new work")
    assert runtime.run(1) == 1
    assert seen == [("b", "new work")]

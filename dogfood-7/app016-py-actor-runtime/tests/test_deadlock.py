from actor_runtime.deadlock import WaitGraph
from actor_runtime.scheduler import Runtime

# @id TEST-DEADLOCK-001 @verifies REQ-DEADLOCK-001 REQ-DEADLOCK-002 REQ-DEADLOCK-003 REQ-DEADLOCK-004 REQ-DEADLOCK-005 REQ-DEADLOCK-006 REQ-DEADLOCK-007 REQ-DEADLOCK-008
def test_deadlock_001_contract():
    graph = WaitGraph()
    graph.wait("b", "a")
    assert graph.cycles() == []
    graph.wait("a", "b")
    assert graph.cycles() == [("a", "b")]
    graph.wait("b", "c")
    graph.wait("c", "b")
    graph.wait("z", "z")
    assert graph.cycles() == [("a", "b", "c"), ("z",)]
    graph.release("b")
    assert graph.cycles() == [("z",)]
    graph.release("z")
    assert graph.cycles() == []
    runtime = Runtime()
    seen = []
    runtime.spawn("a", lambda rt, name, msg: seen.append(msg))
    runtime.send("a", 42)
    runtime.block("a")
    assert not runtime.step()
    runtime.unblock("a")
    assert runtime.step() and seen == [42]

# @id TEST-DEADLOCK-002 @verifies REQ-DEADLOCK-009
def test_deadlock_002_deep_graph():
    graph = WaitGraph()
    for index in range(1500):
        graph.wait(f"n{index:04}", f"n{index + 1:04}")
    assert graph.cycles() == []
    graph.wait("n1500", "n0000")
    assert graph.cycles() == [tuple(f"n{index:04}" for index in range(1501))]

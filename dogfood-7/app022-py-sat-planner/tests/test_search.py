import pytest
from planner.model import Action, Task
from planner.search import solve
from tests.support import chain


# @id TEST-SRC-001 @verifies REQ-SRC-001 REQ-SRC-002 REQ-SRC-003 REQ-SRC-004
def test_src_001():
    t = chain()
    expensive = Action("direct", pre={("s",)}, add={("g",)}, cost=9)
    weighted = Task((expensive,) + t.actions, t.initial, t.goal)
    result = solve(weighted)
    assert result.status == "solved" and result.cost == 2 and result.plan == ("first", "second")
    assert solve(t, "gbfs").plan == ("first", "second")
    assert solve(Task((), t.goal, t.goal)).plan == ()
    assert solve(Task((), t.initial, t.goal)).status == "unsolvable"


# @id TEST-SRC-002 @verifies REQ-SRC-005 REQ-SRC-006 REQ-SRC-007 REQ-SRC-008
def test_src_002():
    t = Task((
        Action("costly", pre={("s",)}, add={("m",)}, delete={("s",)}, cost=5),
        Action("detour", pre={("s",)}, add={("d",)}, delete={("s",)}),
        Action("join", pre={("d",)}, add={("m",)}, delete={("d",)}),
        Action("finish", pre={("m",)}, add={("g",)}, delete={("m",)}, cost=10),
    ), frozenset({("s",)}), frozenset({("g",)}))
    def admissible(task, state):
        return 10 if ("d",) in state else 0
    r = solve(t, heuristic=admissible)
    assert r.plan == ("detour", "join", "finish") and r.cost == 12
    assert r.expanded >= 4 and r.generated >= 4
    assert solve(t, limit=0).status == "limit"
    for kwargs in ({"algorithm": "dfs"}, {"limit": -1}, {"limit": True}):
        with pytest.raises(ValueError):
            solve(t, **kwargs)

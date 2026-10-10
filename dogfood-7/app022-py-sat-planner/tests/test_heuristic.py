from math import inf
from planner.model import Action, Task
from planner.heuristic import hff
from tests.support import chain


# @id TEST-HFF-001 @verifies REQ-HFF-001 REQ-HFF-002 REQ-HFF-003 REQ-HFF-004
def test_hff_001():
    t = chain()
    assert hff(t, t.goal) == 0
    assert hff(t, t.initial) == 2
    multi = Task((Action("both", add={("a",), ("b",)}),), frozenset(), frozenset({("a",), ("b",)}))
    assert hff(multi, multi.initial) == 1
    relaxed = Task((Action("add", pre={("p",)}, add={("q",)}, delete={("p",)}),), frozenset({("p",)}), frozenset({("p",), ("q",)}))
    assert hff(relaxed, relaxed.initial) == 1


# @id TEST-HFF-002 @verifies REQ-HFF-005 REQ-HFF-006 REQ-HFF-007 REQ-HFF-008
def test_hff_002():
    blocked = Task((Action("loop", pre={("g",)}, add={("g",)}),), frozenset(), frozenset({("g",)}))
    assert hff(blocked, blocked.initial) == inf
    t = chain()
    original = t.initial
    assert [hff(t, t.initial) for _ in range(4)] == [2] * 4
    assert t.initial == original
    assert hff(t, frozenset({("m",)})) == 1

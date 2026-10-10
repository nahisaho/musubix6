import pytest
from dataflow.clock import Event
from dataflow.state import KeyedState, filter_event, map_event

# @id TEST-STATE-001 @verifies REQ-STATE-001
def test_state_001():
    s = KeyedState()
    for v in (3, -1, 8):
        s.apply(Event(1, "a", v))
    assert s.get("a") == {"count": 3, "sum": 10, "min": -1, "max": 8}

# @id TEST-STATE-002 @verifies REQ-STATE-002
def test_state_002():
    s = KeyedState()
    s.apply(Event(1, "a", 2))
    s.apply(Event(1, "b", 7))
    assert s.get("a")["sum"] == 2
    assert s.get("b")["sum"] == 7

# @id TEST-STATE-003 @verifies REQ-STATE-003
def test_state_003():
    assert KeyedState().get("absent") is None

# @id TEST-STATE-004 @verifies REQ-STATE-004
def test_state_004():
    e = Event(1, "a", 3)
    assert filter_event(e, lambda x: x.value > 2) == e
    assert filter_event(e, lambda x: x.value < 2) is None

# @id TEST-STATE-005 @verifies REQ-STATE-005
def test_state_005():
    e = Event(1, "a", 3, "p")
    assert map_event(e, lambda x: x * 2) == Event(1, "a", 6, "p")
    assert e.value == 3

# @id TEST-STATE-006 @verifies REQ-STATE-006
def test_state_006():
    s = KeyedState()
    s.apply(Event(1, "a", 2))
    for value in (float("nan"), float("inf")):
        with pytest.raises(ValueError):
            s.apply(Event(1, "a", value))
    assert s.get("a")["count"] == 1

# @id TEST-STATE-007 @verifies REQ-STATE-007
def test_state_007():
    s = KeyedState()
    s.apply(Event(1, "a", 2))
    s.apply(Event(1, "b", 3))
    s.delete("a")
    s.delete("missing")
    assert s.get("a") is None
    assert s.get("b")["sum"] == 3

# @id TEST-STATE-008 @verifies REQ-STATE-008
def test_state_008():
    s = KeyedState()
    s.apply(Event(1, "a", 2))
    view = s.export()
    view["a"]["count"] = 90
    single = s.get("a")
    single["sum"] = 999
    assert s.get("a") == {"count": 1, "sum": 2, "min": 2, "max": 2}

# @id TEST-STATE-009 @verifies REQ-STATE-009
def test_state_009():
    s = KeyedState()
    s.apply(Event(1, "a", 1e308))
    with pytest.raises(ValueError):
        s.apply(Event(1, "a", 1e308))
    assert s.get("a")["count"] == 1
    assert s.get("a")["sum"] == 1e308


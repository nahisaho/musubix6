import pytest
from dataflow.clock import Event
from dataflow.engine import Engine

# @id TEST-FLOW-001 @verifies REQ-FLOW-001
def test_flow_001():
    e = Engine(size=10)
    assert e.process(Event(1, "a", 2)) is True
    e.process(Event(9, "a", 3))
    assert e.advance(10) == [{"key": "a", "start": 0, "end": 10, "count": 2, "sum": 5, "min": 2, "max": 3}]

# @id TEST-FLOW-002 @verifies REQ-FLOW-002
def test_flow_002():
    e = Engine(size=10)
    e.process(Event(12, "b", 1))
    e.process(Event(1, "z", 4))
    e.process(Event(2, "a", 2))
    assert [(r["key"], r["end"]) for r in e.advance(10)] == [("a", 10), ("z", 10)]
    assert e.advance(10) == []
    assert e.advance(20)[0]["key"] == "b"

# @id TEST-FLOW-003 @verifies REQ-FLOW-003
def test_flow_003():
    e = Engine(late_policy="drop")
    e.advance(10)
    assert e.process(Event(9, "a", 3)) is False
    assert e.dropped == 1
    assert e.advance(20) == []

# @id TEST-FLOW-004 @verifies REQ-FLOW-004
def test_flow_004():
    e = Engine(late_policy="side")
    e.advance(10)
    event = Event(9, "a", 3)
    assert e.process(event) is False
    assert e.late == [event]
    assert e.dropped == 0
    assert e.advance(20) == []

# @id TEST-FLOW-005 @verifies REQ-FLOW-005
def test_flow_005():
    e = Engine(late_policy="error")
    e.advance(10)
    with pytest.raises(ValueError):
        e.process(Event(9, "a", 3))
    assert e.dropped == 0 and e.late == []
    assert e.advance(20) == []

# @id TEST-FLOW-006 @verifies REQ-FLOW-006
def test_flow_006():
    e = Engine(mode="sliding", size=10, slide=5)
    e.process(Event(9, "a", 2))
    assert [(r["start"], r["sum"]) for r in e.advance(15)] == [(0, 2), (5, 2)]

# @id TEST-FLOW-007 @verifies REQ-FLOW-007
def test_flow_007():
    e = Engine(mode="session", gap=5)
    for t, v in ((0, 1), (8, 2), (4, 3)):
        e.process(Event(t, "a", v))
    result = e.advance(13)
    assert len(result) == 1
    assert (result[0]["start"], result[0]["end"], result[0]["count"], result[0]["sum"]) == (0, 13, 3, 6)

# @id TEST-FLOW-008 @verifies REQ-FLOW-008
def test_flow_008():
    for kwargs in ({"late_policy": "other"}, {"mode": "other"}, {"size": 0}, {"mode": "sliding", "slide": 0}, {"mode": "session", "gap": -1}):
        with pytest.raises(ValueError):
            Engine(**kwargs)

# @id TEST-FLOW-009 @verifies REQ-FLOW-009
def test_flow_009():
    e = Engine()
    e.process(Event(2, "a", 3))
    e.advance(3)
    for value in (2, float("nan"), float("inf"), -float("inf")):
        with pytest.raises(ValueError):
            e.advance(value)
        assert e.watermark == 3
        assert e.dropped == 0 and e.late == []
    assert e.advance(10)[0]["sum"] == 3


# @id TEST-FLOW-010 @verifies REQ-FLOW-010
def test_flow_010():
    for policy in ("drop", "side", "error"):
        e = Engine(late_policy=policy)
        e.advance(10)
        for value in (float("nan"), float("inf")):
            with pytest.raises(ValueError):
                e.process(Event(1, "a", value))
        assert e.dropped == 0 and e.late == []
        assert e.advance(20) == []

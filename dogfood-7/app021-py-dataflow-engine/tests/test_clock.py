import pytest
from dataflow.clock import Event, Clock

# @id TEST-CLOCK-001 @verifies REQ-CLOCK-001
def test_clock_001():
    e = Event(-1.5, "k", 4, "a")
    assert (e.timestamp, e.key, e.value, e.partition) == (-1.5, "k", 4, "a")

# @id TEST-CLOCK-002 @verifies REQ-CLOCK-002
def test_clock_002():
    for t in (float("nan"), float("inf"), -float("inf")):
        with pytest.raises(ValueError):
            Event(t, "k", 1)

# @id TEST-CLOCK-003 @verifies REQ-CLOCK-003
def test_clock_003():
    c = Clock(["a", "b"], lag=2)
    assert c.observe(Event(10, "k", 1, "a")) == -float("inf")
    assert c.observe(Event(7, "k", 1, "b")) == 5
    assert c.observe(Event(15, "k", 1, "b")) == 8

# @id TEST-CLOCK-004 @verifies REQ-CLOCK-004
def test_clock_004():
    c = Clock(["a"])
    c.observe(Event(9, "k", 1, "a"))
    assert c.observe(Event(3, "k", 1, "a")) == 9

# @id TEST-CLOCK-005 @verifies REQ-CLOCK-005
def test_clock_005():
    c = Clock(["a", "b"])
    c.observe(Event(8, "k", 1, "a"))
    assert c.set_idle("b", True) == 8
    assert c.set_idle("b", False) == 8
    assert c.observe(Event(5, "k", 1, "b")) == 8

# @id TEST-CLOCK-006 @verifies REQ-CLOCK-006
def test_clock_006():
    c = Clock(["a"])
    c.advance(10)
    with pytest.raises(ValueError):
        c.advance(9)
    assert c.watermark == 10

# @id TEST-CLOCK-007 @verifies REQ-CLOCK-007
def test_clock_007():
    c = Clock(["a"])
    c.advance(10)
    assert c.is_late(Event(9.9, "k", 1))
    assert not c.is_late(Event(10, "k", 1))

# @id TEST-CLOCK-008 @verifies REQ-CLOCK-008
def test_clock_008():
    with pytest.raises(ValueError):
        Clock(["a"], lag=-1)
    c = Clock(["a"])
    with pytest.raises(ValueError):
        c.observe(Event(1, "k", 1, "b"))
    with pytest.raises(ValueError):
        c.set_idle("b", True)


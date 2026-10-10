import pytest
from dataflow.windows import tumbling, sliding, Sessions

# @id TEST-WINDOW-001 @verifies REQ-WINDOW-001
def test_window_001():
    assert tumbling(10, 10) == [(10, 20)]
    assert tumbling(-0.1, 10) == [(-10, 0)]
    assert tumbling(0, 10) == [(0, 10)]

# @id TEST-WINDOW-002 @verifies REQ-WINDOW-002
def test_window_002():
    assert sliding(9, 10, 5) == [(0, 10), (5, 15)]
    assert sliding(10, 10, 5) == [(5, 15), (10, 20)]
    assert sliding(-1, 10, 5) == [(-10, 0), (-5, 5)]
    assert sliding(4, 3, 5) == []

# @id TEST-WINDOW-003 @verifies REQ-WINDOW-003
def test_window_003():
    for size in (0, -1, float("nan"), float("inf")):
        with pytest.raises(ValueError):
            tumbling(1, size)
    for slide in (0, -1):
        with pytest.raises(ValueError):
            sliding(1, 10, slide)

# @id TEST-WINDOW-004 @verifies REQ-WINDOW-004
def test_window_004():
    s = Sessions(5)
    s.add("a", 1)
    assert s.add("a", 4) == (1, 9)
    assert s.intervals("a") == [(1, 9)]

# @id TEST-WINDOW-005 @verifies REQ-WINDOW-005
def test_window_005():
    s = Sessions(5)
    s.add("a", 0)
    s.add("a", 8)
    assert s.add("a", 4) == (0, 13)
    assert s.intervals("a") == [(0, 13)]

# @id TEST-WINDOW-006 @verifies REQ-WINDOW-006
def test_window_006():
    s = Sessions(5)
    s.add("a", 0)
    s.add("b", 2)
    assert s.intervals("a") == [(0, 5)]
    assert s.intervals("b") == [(2, 7)]

# @id TEST-WINDOW-007 @verifies REQ-WINDOW-007
def test_window_007():
    s = Sessions(5)
    s.add("a", 0)
    s.add("b", 3)
    assert s.close(5) == [("a", 0, 5)]
    assert s.intervals("a") == []
    assert s.intervals("b") == [(3, 8)]


# @id TEST-WINDOW-010 @verifies REQ-WINDOW-010
def test_window_010():
    assert tumbling(0.6, 0.1) == [(0.6, 0.7)]
    result = sliding(2.3, 0.7, 0.2)
    assert result == [(1.8, 2.5), (2.0, 2.7), (2.2, 2.9)]
    assert all(a <= 2.3 < b for a, b in result)
    for t in (-0.6, -0.3, 0.3, 0.6, 2.3):
        assert len(tumbling(t, 0.1)) == 1
        for a, b in tumbling(t, 0.1) + sliding(t, 0.7, 0.2):
            assert a <= t < b

# @id TEST-WINDOW-008 @verifies REQ-WINDOW-008
def test_window_008():
    with pytest.raises(ValueError):
        Sessions(0)
    s = Sessions(1)
    s.add("a", 0)
    assert s.close(1) == [("a", 0, 1)]
    assert s.close(1) == []

# @id TEST-WINDOW-009 @verifies REQ-WINDOW-009
def test_window_009():
    with pytest.raises(ValueError):
        tumbling(1e308, 1e-308)
    s = Sessions(1e308)
    with pytest.raises(ValueError):
        s.add("a", 1e308)
    assert s.intervals("a") == []

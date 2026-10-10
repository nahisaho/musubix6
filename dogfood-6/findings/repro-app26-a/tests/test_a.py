from pk.m import tokenize, Counter, Sub


# @id TEST-A-001
# @verifies REQ-A-001
def test_a_001():
    toks = tokenize("a b")
    got = [t for t in toks if t != "x"]
    assert got == ["a", "b"]


# @id TEST-A-002
# @verifies REQ-A-002
def test_a_002():
    res = tokenize("a b")
    assert res == ["a", "b"]


# @id TEST-A-003
# @verifies REQ-A-003
def test_a_003():
    s = Counter()
    s.fresh()
    assert s.fresh() == 1


# @id TEST-A-004
# @verifies REQ-A-004
def test_a_004():
    s = Sub({1: 2})
    assert s.apply(1) == 2


import pytest


# @id TEST-A-005
# @verifies REQ-A-005
@pytest.mark.parametrize("x,y", [(1, 2), (2, 3)])
def test_a_005(x, y):
    assert Sub({x: y}).apply(x) == y


class TestK:
    # @id TEST-A-006
    # @verifies REQ-A-006
    def test_a_006(self):
        assert Counter().fresh() == 0

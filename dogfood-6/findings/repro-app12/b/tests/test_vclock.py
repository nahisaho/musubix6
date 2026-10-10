import itertools
import pytest
from crdt.vclock import VClock

SAMPLES = [
    {}, {"a": 1}, {"a": 2}, {"b": 1}, {"a": 1, "b": 2}, {"a": 3, "b": 1}, {"c": 4, "a": 1},
]


# @id TEST-VCLOCK-001
# @verifies REQ-VCLOCK-001
def test_vclock_001():
    base = VClock({"a": 1})
    nxt = base.increment("a")
    assert nxt.get("a") == 2
    assert base.get("a") == 1
    assert VClock().increment("z").get("z") == 1


# @id TEST-VCLOCK-002
# @verifies REQ-VCLOCK-002
def test_vclock_002():
    assert VClock({"a": 1}).get("nope") == 0


# @id TEST-VCLOCK-003
# @verifies REQ-VCLOCK-003
def test_vclock_003():
    m = VClock({"a": 3, "b": 1}).merge(VClock({"a": 1, "c": 2}))
    assert m.to_dict() == {"a": 3, "b": 1, "c": 2}


# @id TEST-VCLOCK-004
# @verifies REQ-VCLOCK-004
def test_vclock_004():
    clocks = [VClock(d) for d in SAMPLES]
    for a, b in itertools.product(clocks, repeat=2):
        assert a.merge(b) == b.merge(a)
    for a in clocks:
        assert a.merge(a) == a
    for a, b, c in itertools.product(clocks, repeat=3):
        assert a.merge(b).merge(c) == a.merge(b.merge(c))


# @id TEST-VCLOCK-005
# @verifies REQ-VCLOCK-005
def test_vclock_005():
    assert VClock({"a": 1}).compare(VClock({"a": 1})) == "equal"
    assert VClock({"a": 1}).compare(VClock({"a": 2})) == "before"
    assert VClock({"a": 2, "b": 1}).compare(VClock({"a": 1})) == "after"
    assert VClock({"a": 1}).compare(VClock({"b": 1})) == "concurrent"
    assert VClock().compare(VClock({"a": 1})) == "before"
    assert VClock({"a": 2, "b": 1}).compare(VClock({"a": 1, "b": 2})) == "concurrent"


# @id TEST-VCLOCK-006
# @verifies REQ-VCLOCK-006
def test_vclock_006():
    z = VClock({"a": 0})
    assert z == VClock()
    assert hash(z) == hash(VClock())
    assert z.to_dict() == {}
    assert len({VClock({"a": 0, "b": 1}), VClock({"b": 1})}) == 1


# @id TEST-VCLOCK-007
# @verifies REQ-VCLOCK-007
@pytest.mark.parametrize("bad", [{"a": -1}, {"a": 1.5}, {"a": True}, {"": 1}, {"a": "1"}])
def test_vclock_007(bad):
    with pytest.raises(ValueError):
        VClock(bad)


# @id TEST-VCLOCK-008
# @verifies REQ-VCLOCK-008
def test_vclock_008():
    big, small = VClock({"a": 2, "b": 1}), VClock({"a": 1})
    assert big.dominates(small)
    assert big.dominates(big)
    assert not small.dominates(big)
    assert not VClock({"a": 1}).dominates(VClock({"b": 1}))


# @id TEST-VCLOCK-009
# @verifies REQ-VCLOCK-009
def test_vclock_009():
    c = VClock({"z": 1, "a": 2, "m": 3})
    assert list(c.to_dict()) == ["a", "m", "z"]
    assert VClock.from_dict(c.to_dict()) == c
    assert VClock.from_dict({}) == VClock()


# @id TEST-VCLOCK-010
# @verifies REQ-VCLOCK-010
def test_vclock_010():
    c = VClock({"a": 2, "b": 1, "c": 5})
    assert c.prune({"a", "c"}).to_dict() == {"a": 2, "c": 5}
    assert c.prune(set()) == VClock()
    assert c.prune({"a", "b", "c", "x"}) == c


# @id TEST-VCLOCK-011
# @verifies REQ-VCLOCK-011
@pytest.mark.parametrize("bad", [0, -1, 1.5, True, None])
def test_vclock_011(bad):
    c = VClock({"a": 3})
    with pytest.raises(ValueError):
        c.increment("a", bad)
    assert c.to_dict() == {"a": 3}
    assert c.increment("a", 4).get("a") == 7

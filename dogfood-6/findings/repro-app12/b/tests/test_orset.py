import random
import pytest
from crdt.orset import ORSet
from crdt.vclock import VClock


def copy(s, replica):
    return ORSet.from_dict(s.to_dict(), replica)


# @id TEST-ORSET-001
# @verifies REQ-ORSET-001
def test_orset_001():
    s = ORSet("a")
    t1, t2, t3 = s.add("x"), s.add("x"), s.add("y")
    assert t1 == ("a", 1) and t2 == ("a", 2) and t3 == ("a", 3)
    other = ORSet("b")
    assert other.add("x") == ("b", 1)


# @id TEST-ORSET-002
# @verifies REQ-ORSET-002
def test_orset_002():
    s = ORSet("a")
    assert not s.contains("x")
    s.add("x")
    s.add("y")
    assert s.contains("x") and "y" in s
    assert s.elements() == ["x", "y"]
    s.remove("x")
    assert s.elements() == ["y"]
    assert not s.contains("x")


# @id TEST-ORSET-003
# @verifies REQ-ORSET-003
def test_orset_003():
    a = ORSet("a")
    a.add("x")
    b = copy(a, "b")
    b.add("x")
    assert a.remove("x") is True
    assert a.to_dict()["removed"] == [["a", 1]]
    assert not a.contains("x")
    assert a.merge(b).contains("x")


# @id TEST-ORSET-004
# @verifies REQ-ORSET-004
def test_orset_004():
    a = ORSet("a")
    a.add("x")
    b = copy(a, "b")
    b.remove("x")
    a.add("x")
    for m in (a.merge(b), b.merge(a)):
        assert m.contains("x")
    c = copy(a, "c")
    c.remove("x")
    d = copy(a, "d")
    assert not c.merge(d).contains("x")
    assert not d.merge(c).contains("x")


# @id TEST-ORSET-005
# @verifies REQ-ORSET-005
def test_orset_005():
    s = ORSet("a")
    before = s.to_dict()
    assert s.remove("ghost") is False
    assert s.to_dict() == before
    s.add("x")
    s.remove("x")
    snap = s.to_dict()
    assert s.remove("x") is False
    assert s.to_dict() == snap


# @id TEST-ORSET-006
# @verifies REQ-ORSET-006
def test_orset_006():
    s = ORSet("a")
    s.add("x")
    s.remove("x")
    assert not s.contains("x")
    s.add("x")
    assert s.contains("x")
    stale = ORSet.from_dict({"adds": [["x", [["a", 1]]]], "removed": [], "seq": 1}, "b")
    assert s.merge(stale).contains("x")
    s.remove("x")
    assert not s.merge(stale).contains("x")


def random_set(rng, replica):
    s = ORSet(replica)
    for _ in range(rng.randint(0, 8)):
        e = rng.choice("pqr")
        if rng.random() < 0.35:
            s.remove(e)
        else:
            s.add(e)
    return s


# @id TEST-ORSET-007
# @verifies REQ-ORSET-007
def test_orset_007():
    def obs(s):
        d = s.to_dict()
        return d["adds"], d["removed"]

    rng = random.Random(7)
    for _ in range(80):
        x, y, z = (random_set(rng, r) for r in "abc")
        assert obs(x.merge(y)) == obs(y.merge(x))
        assert obs(x.merge(x)) == obs(x)
        assert obs(x.merge(y).merge(z)) == obs(x.merge(y.merge(z)))


# @id TEST-ORSET-008
# @verifies REQ-ORSET-008
def test_orset_008():
    old = ORSet("a")
    old.add("x")
    old.add("y")
    fresh = ORSet("a")
    revived = fresh.merge(old)
    assert revived.add("z") == ("a", 3)
    only_removed = ORSet.from_dict({"adds": [], "removed": [["a", 5]], "seq": 0}, "a")
    assert only_removed.add("w") == ("a", 6)
    assert ORSet.from_dict(old.to_dict(), "a").add("q") == ("a", 3)


# @id TEST-ORSET-009
# @verifies REQ-ORSET-009
def test_orset_009():
    s = ORSet("a")
    s.add("x")
    s.add("x")
    s.add("y")
    s.remove("x")
    other = copy(s, "b")
    assert s.compact() == 2
    assert s.elements() == ["y"]
    assert s.compact() == 0
    assert s.to_dict()["adds"] == [["y", [["a", 3]]]]
    assert s.merge(other).elements() == ["y"]
    assert other.merge(s).elements() == ["y"]


# @id TEST-ORSET-010
# @verifies REQ-ORSET-010
def test_orset_010():
    a = ORSet("a")
    a.add("x")
    a.add("y")
    b = ORSet("b")
    b.add("x")
    m = a.merge(b)
    assert m.context() == VClock({"a": 2, "b": 1})
    assert ORSet("c").context() == VClock()
    a.remove("y")
    assert a.context() == VClock({"a": 2})


# @id TEST-ORSET-011
# @verifies REQ-ORSET-011
def test_orset_011():
    s = ORSet("a")
    s.add(2)
    s.add("b")
    s.add("b")
    s.remove(2)
    d = s.to_dict()
    assert d["seq"] == 3
    assert ORSet.from_dict(d, "a").to_dict() == d
    assert ORSet.from_dict(d, "z").elements() == ["b"]
    with pytest.raises(TypeError):
        s.add(["unhashable"])


# @id TEST-ORSET-012
# @verifies REQ-ORSET-012
def test_orset_012():
    a = ORSet("a")
    a.add("x")
    a.add("x2")
    b = ORSet("b")
    b.add("y")
    ab, ba = a.merge(b), b.merge(a)
    assert ab.to_dict()["seq"] != ba.to_dict()["seq"]
    assert ab.canonical() == ba.canonical()
    assert "seq" not in ab.canonical()
    assert ab.canonical()["removed"] == []

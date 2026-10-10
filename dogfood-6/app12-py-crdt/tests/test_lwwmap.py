import itertools
import random
from crdt.lwwmap import LWWMap


def clone(m, replica):
    return LWWMap.from_dict(m.to_dict(), replica)


# @id TEST-LWWMAP-001
# @verifies REQ-LWWMAP-001
def test_lwwmap_001():
    m = LWWMap("a")
    assert m.set("k", {"x": 1}, 10) is True
    assert m.get("k") == {"x": 1}
    assert m.to_dict()["k"][:3] == [10, "a", False]
    assert m.get("missing") is None
    assert m.get("missing", 7) == 7


# @id TEST-LWWMAP-002
# @verifies REQ-LWWMAP-002
def test_lwwmap_002():
    a, b = LWWMap("a"), LWWMap("b")
    a.set("k", "old", 5)
    b.set("k", "new", 9)
    assert a.merge(b).get("k") == "new"
    assert b.merge(a).get("k") == "new"


# @id TEST-LWWMAP-003
# @verifies REQ-LWWMAP-003
def test_lwwmap_003():
    a, b = LWWMap("a"), LWWMap("b")
    a.set("k", "from-a", 5)
    b.set("k", "from-b", 5)
    assert a.merge(b).get("k") == "from-b"
    assert b.merge(a).get("k") == "from-b"


# @id TEST-LWWMAP-004
# @verifies REQ-LWWMAP-004
def test_lwwmap_004():
    m = LWWMap("a")
    m.set("k", 1, 1)
    m.set("j", 2, 1)
    assert m.delete("k", 2) is True
    assert m.get("k") is None
    assert m.get("k", "dflt") == "dflt"
    assert m.keys() == ["j"]
    assert m.to_dict()["k"][2] is True


# @id TEST-LWWMAP-005
# @verifies REQ-LWWMAP-005
def test_lwwmap_005():
    a = LWWMap("a")
    a.set("k", "v", 5)
    b = clone(a, "b")
    b.delete("k", 6)
    assert a.merge(b).get("k") is None
    older = clone(a, "c")
    older.delete("k", 4)
    assert a.merge(older).get("k") == "v"
    a.set("k", "w", 7)
    assert a.merge(b).get("k") == "w"
    assert b.merge(a).get("k") == "w"


# @id TEST-LWWMAP-006
# @verifies REQ-LWWMAP-006
def test_lwwmap_006():
    m = LWWMap("a")
    assert m.set("k", 1, 5) is True
    assert m.set("k", 2, 5) is False
    assert m.set("k", 3, 4) is False
    assert m.delete("k", 5) is False
    assert m.get("k") == 1
    z = LWWMap("z")
    z.set("k", "z", 5)
    m2 = m.merge(z)
    assert m2.set("k", "late", 5) is False
    assert m2.set("k", "late", 6) is True


# @id TEST-LWWMAP-007
# @verifies REQ-LWWMAP-007
def test_lwwmap_007():
    one = LWWMap.from_dict({"k": [5, "a", False, "apple"]}, "a")
    two = LWWMap.from_dict({"k": [5, "a", False, "banana"]}, "a")
    tomb = LWWMap.from_dict({"k": [5, "a", True, None]}, "a")
    assert one.merge(two).get("k") == "banana"
    assert two.merge(one).get("k") == "banana"
    assert one.merge(tomb).get("k") is None
    assert tomb.merge(two).get("k") is None
    assert tomb.merge(two).to_dict() == two.merge(tomb).to_dict()


def random_map(rng, replica):
    m = LWWMap(replica)
    for _ in range(rng.randint(0, 6)):
        key = rng.choice("xyz")
        ts = rng.randint(1, 6)
        if rng.random() < 0.3:
            m.delete(key, ts)
        else:
            m.set(key, rng.randint(0, 3), ts)
    return m


# @id TEST-LWWMAP-008
# @verifies REQ-LWWMAP-008
def test_lwwmap_008():
    rng = random.Random(8)
    for _ in range(80):
        x, y, z = (random_map(rng, r) for r in "abc")
        assert x.merge(y).to_dict() == y.merge(x).to_dict()
        assert x.merge(x).to_dict() == x.to_dict()
        assert x.merge(y).merge(z).to_dict() == x.merge(y.merge(z)).to_dict()
    x = LWWMap.from_dict({"k": [5, "a", False, 1]}, "a")
    y = LWWMap.from_dict({"k": [5, "a", False, 2]}, "a")
    z = LWWMap.from_dict({"k": [5, "a", True, None]}, "a")
    for p in itertools.permutations([x, y, z]):
        assert p[0].merge(p[1]).merge(p[2]).to_dict() == x.merge(y).merge(z).to_dict()


# @id TEST-LWWMAP-009
# @verifies REQ-LWWMAP-009
def test_lwwmap_009():
    m = LWWMap("a")
    m.set("a", 1, 1)
    m.set("b", 1, 1)
    m.set("c", 1, 1)
    m.delete("a", 3)
    m.delete("b", 5)
    assert m.gc(5) == 1
    assert "a" not in m.to_dict()
    assert m.to_dict()["b"][2] is True
    assert m.gc(5) == 0
    assert m.gc(6) == 1
    assert m.get("c") == 1


# @id TEST-LWWMAP-010
# @verifies REQ-LWWMAP-010
def test_lwwmap_010():
    m = LWWMap("a")
    m.set("z", 1, 1)
    m.set("b", 2, 1)
    m.set("m", 3, 1)
    m.delete("m", 2)
    assert m.items() == [("b", 2), ("z", 1)]
    back = LWWMap.from_dict(m.to_dict(), "q")
    assert back.to_dict() == m.to_dict()
    assert back.items() == m.items()
    assert list(m.to_dict()) == ["b", "m", "z"]


# @id TEST-LWWMAP-011
# @verifies REQ-LWWMAP-011
def test_lwwmap_011():
    import pytest
    m = LWWMap("a")
    m.set("a", 1, 1)
    with pytest.raises(TypeError):
        m.set(1, "x", 2)
    with pytest.raises(TypeError):
        m.delete(None, 2)
    assert list(m.to_dict()) == ["a"]

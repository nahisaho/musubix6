import random
import pytest
from crdt.counters import GCounter, PNCounter


def make_g(replica, incs):
    c = GCounter(replica)
    for n in incs:
        c.increment(n)
    return c


def make_pn(replica, incs, decs):
    c = PNCounter(replica)
    for n in incs:
        c.increment(n)
    for n in decs:
        c.decrement(n)
    return c


# @id TEST-COUNTERS-001
# @verifies REQ-COUNTERS-001
@pytest.mark.parametrize("bad", [0, -1, 1.5, True, "2"])
def test_counters_001(bad):
    c = GCounter("a")
    c.increment(2)
    c.increment()
    assert c.to_dict() == {"a": 3}
    with pytest.raises(ValueError):
        c.increment(bad)
    assert c.to_dict() == {"a": 3}


# @id TEST-COUNTERS-002
# @verifies REQ-COUNTERS-002
def test_counters_002():
    a, b = make_g("a", [2, 3]), make_g("b", [4])
    assert GCounter("x").value == 0
    assert a.merge(b).value == 9


# @id TEST-COUNTERS-003
# @verifies REQ-COUNTERS-003
def test_counters_003():
    a, b = make_g("a", [5]), make_g("b", [1])
    a2 = GCounter.from_dict({"a": 2, "b": 7}, "a")
    m = a.merge(a2).merge(b)
    assert m.to_dict() == {"a": 5, "b": 7}
    assert a.to_dict() == {"a": 5}
    assert b.to_dict() == {"b": 1}
    m.increment(1)
    assert a.to_dict() == {"a": 5}


# @id TEST-COUNTERS-004
# @verifies REQ-COUNTERS-004
def test_counters_004():
    rng = random.Random(4)
    for _ in range(60):
        gs = [make_g(r, [rng.randint(1, 5) for _ in range(rng.randint(0, 3))]) for r in "abc"]
        x, y, z = gs
        assert x.merge(y).to_dict() == y.merge(x).to_dict()
        assert x.merge(x).to_dict() == x.to_dict()
        assert x.merge(y).merge(z).to_dict() == x.merge(y.merge(z)).to_dict()
        ps = [make_pn(r, [rng.randint(1, 5) for _ in range(2)], [rng.randint(1, 3)]) for r in "abc"]
        p, q, s = ps
        assert p.merge(q).to_dict() == q.merge(p).to_dict()
        assert p.merge(p).to_dict() == p.to_dict()
        assert p.merge(q).merge(s).to_dict() == p.merge(q.merge(s)).to_dict()


# @id TEST-COUNTERS-005
# @verifies REQ-COUNTERS-005
def test_counters_005():
    rng = random.Random(5)
    for _ in range(40):
        a = make_g("a", [rng.randint(1, 9) for _ in range(3)])
        b = make_g("b", [rng.randint(1, 9)])
        m = a.merge(b)
        assert m.value >= a.value and m.value >= b.value
        stale = GCounter.from_dict(a.to_dict(), "a")
        a.increment(3)
        assert a.merge(stale).value == a.value


# @id TEST-COUNTERS-006
# @verifies REQ-COUNTERS-006
def test_counters_006():
    c = PNCounter("a")
    c.increment(5)
    c.decrement(8)
    assert c.value == -3
    assert c.to_dict() == {"p": {"a": 5}, "n": {"a": 8}}
    with pytest.raises(ValueError):
        c.decrement(0)
    with pytest.raises(ValueError):
        c.increment(-2)


# @id TEST-COUNTERS-007
# @verifies REQ-COUNTERS-007
def test_counters_007():
    a = make_pn("a", [4], [1])
    b = make_pn("b", [2], [5])
    m = a.merge(b)
    assert m.to_dict() == {"p": {"a": 4, "b": 2}, "n": {"a": 1, "b": 5}}
    assert m.value == -0
    assert m.merge(a).value == m.value


# @id TEST-COUNTERS-008
# @verifies REQ-COUNTERS-008
def test_counters_008():
    g = make_g("b", [2])
    g = g.merge(make_g("a", [1]))
    assert list(g.to_dict()) == ["a", "b"]
    assert GCounter.from_dict(g.to_dict(), "a").to_dict() == g.to_dict()
    pn = make_pn("a", [3], [1])
    assert PNCounter.from_dict(pn.to_dict(), "a").to_dict() == pn.to_dict()
    for bad in ({"a": -1}, {"a": 1.5}, {"a": True}):
        with pytest.raises(ValueError):
            GCounter.from_dict(bad, "a")
    with pytest.raises(ValueError):
        PNCounter.from_dict({"p": {"a": -1}, "n": {}}, "a")


# @id TEST-COUNTERS-009
# @verifies REQ-COUNTERS-009
def test_counters_009():
    with pytest.raises(TypeError):
        GCounter("a").merge(PNCounter("a"))
    with pytest.raises(TypeError):
        PNCounter("a").merge(GCounter("a"))
    with pytest.raises(TypeError):
        GCounter("a").merge({"a": 1})

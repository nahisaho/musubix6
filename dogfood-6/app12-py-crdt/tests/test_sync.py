import random
import pytest
from crdt.counters import GCounter, PNCounter
from crdt.lwwmap import LWWMap
from crdt.orset import ORSet
from crdt.sync import Network, PartitionError, Store, SyncError, diff, gossip_round, run_until_converged
from crdt.vclock import VClock


def bump(n):
    return lambda c: c.increment(n)


def trio():
    stores = []
    for r in "abc":
        s = Store(r)
        s.register("hits", GCounter(r))
        s.register("tags", ORSet(r))
        stores.append(s)
    return stores


# @id TEST-SYNC-001
# @verifies REQ-SYNC-001
def test_sync_001():
    s = Store("a")
    s.register("hits", GCounter("a"))
    assert s.clock == VClock()
    s.mutate("hits", bump(2))
    s.mutate("hits", bump(3))
    assert s.get("hits").value == 5
    assert s.clock == VClock({"a": 2})
    assert s.mutate("hits", lambda c: c.value) == 5


# @id TEST-SYNC-002
# @verifies REQ-SYNC-002
def test_sync_002():
    s = Store("a")
    with pytest.raises(KeyError):
        s.mutate("nope", bump(1))
    assert s.clock == VClock()
    with pytest.raises(KeyError):
        s.get("nope")


# @id TEST-SYNC-003
# @verifies REQ-SYNC-003
def test_sync_003():
    one, two = Store("a"), Store("a")
    one.register("x", GCounter("a"))
    one.register("y", LWWMap("a"))
    two.register("y", LWWMap("a"))
    two.register("x", GCounter("a"))
    assert one.digest() == two.digest()
    before = one.digest()
    one.mutate("x", bump(1))
    after = one.digest()
    assert after["x"] != before["x"] and after["y"] == before["y"]
    assert set(after) == {"x", "y"}


# @id TEST-SYNC-004
# @verifies REQ-SYNC-004
def test_sync_004():
    assert diff({"a": "1", "b": "2"}, {"a": "1", "b": "9", "c": "3"}) == ["b", "c"]
    assert diff({"z": "1", "m": "1"}, {}) == ["m", "z"]
    assert diff({"a": "1"}, {"a": "1"}) == []


# @id TEST-SYNC-005
# @verifies REQ-SYNC-005
def test_sync_005():
    a, b, _ = trio()
    a.mutate("hits", bump(2))
    b.mutate("hits", bump(5))
    b.mutate("tags", lambda t: t.add("red"))
    assert sync_pair_names(a, b) == 2
    assert a.digest() == b.digest()
    assert a.get("hits").value == 7
    assert a.get("tags").elements() == ["red"]


def sync_pair_names(a, b):
    from crdt.sync import sync_pair
    return sync_pair(a, b)


# @id TEST-SYNC-006
# @verifies REQ-SYNC-006
def test_sync_006():
    a, b = Store("a"), Store("b")
    m = LWWMap("a")
    m.set("k", "v", 3)
    a.register("cfg", m)
    a.register("n", PNCounter("a"))
    a.mutate("n", lambda c: c.decrement(4))
    assert sync_pair_names(a, b) == 2
    assert b.get("cfg").get("k") == "v"
    assert b.get("cfg").replica == "b"
    assert b.get("n").value == -4
    assert type(b.get("n")) is PNCounter


# @id TEST-SYNC-007
# @verifies REQ-SYNC-007
def test_sync_007():
    a, b, c = trio()
    a.mutate("hits", bump(1))
    a.mutate("hits", bump(1))
    b.mutate("hits", bump(1))
    sync_pair_names(a, b)
    assert a.clock == b.clock == VClock({"a": 2, "b": 1})
    c.mutate("tags", lambda t: t.add("x"))
    sync_pair_names(b, c)
    assert c.clock == VClock({"a": 2, "b": 1, "c": 1})
    assert a.clock == VClock({"a": 2, "b": 1})


# @id TEST-SYNC-008
# @verifies REQ-SYNC-008
def test_sync_008():
    a, b = Store("a"), Store("b")
    a.register("only-a", GCounter("a"))
    a.mutate("only-a", bump(1))
    a.register("x", GCounter("a"))
    b.register("x", PNCounter("b"))
    snap_a, snap_b = a.digest(), b.digest()
    clocks = (a.clock, b.clock)
    with pytest.raises(SyncError):
        sync_pair_names(a, b)
    assert a.digest() == snap_a and b.digest() == snap_b
    assert (a.clock, b.clock) == clocks
    assert "only-a" not in b.digest()


# @id TEST-SYNC-009
# @verifies REQ-SYNC-009
def test_sync_009():
    a, b, _ = trio()
    a.mutate("hits", bump(1))
    assert sync_pair_names(a, b) == 1
    assert sync_pair_names(a, b) == 0
    assert sync_pair_names(b, a) == 0
    b.mutate("hits", bump(1))
    assert sync_pair_names(a, b) == 1


# @id TEST-SYNC-010
# @verifies REQ-SYNC-010
def test_sync_010():
    a, b, c = trio()
    net = Network([a, b, c])
    net.partition(["a", "b"], ["c"])
    a.mutate("hits", bump(1))
    c.mutate("hits", bump(10))
    net.sync("a", "b")
    with pytest.raises(PartitionError):
        net.sync("a", "c")
    assert c.get("hits").value == 10
    net.heal()
    net.sync("a", "c")
    assert c.get("hits").value == 11


# @id TEST-SYNC-011
# @verifies REQ-SYNC-011
def test_sync_011():
    def build():
        stores = trio()
        for i, s in enumerate(stores):
            s.mutate("hits", bump(i + 1))
        return Network(stores)

    net = build()
    rounds = run_until_converged(net, random.Random(3), 50)
    assert isinstance(rounds, int) and 1 <= rounds <= 50
    assert all(s.get("hits").value == 6 for s in net.stores.values())
    assert run_until_converged(build(), random.Random(3), 50) == rounds
    assert run_until_converged(net, random.Random(3), 50) == 0
    assert run_until_converged(build(), random.Random(3), 0) is None
    gossip_round(net, random.Random(1))


# @id TEST-SYNC-012
# @verifies REQ-SYNC-012
def test_sync_012():
    a, b = Store("a"), Store("b")
    ga, gb = GCounter("a"), GCounter("b")
    ga.increment(3)
    gb.increment(4)
    a.register("c", ga)
    b.register("c", gb)
    assert a.clock == b.clock == VClock()
    assert sync_pair_names(a, b) == 1
    assert a.get("c").value == b.get("c").value == 7

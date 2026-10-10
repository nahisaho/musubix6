"""Randomized convergence and merge-law harness."""
import random
from dataclasses import dataclass

from crdt.counters import GCounter, PNCounter
from crdt.lwwmap import LWWMap
from crdt.orset import ORSet
from crdt.sync import Network, Store, converged, gossip_round, run_until_converged, sync_pair

# @id CODE-CONVERGENCE-001 @implements REQ-CONVERGENCE-001 REQ-CONVERGENCE-002
KINDS = {"gcounter": GCounter, "pncounter": PNCounter, "lwwmap": LWWMap, "orset": ORSet}
KEYS = "kxyz"
ELEMS = "abcd"


def _state(obj):
    return obj.canonical() if hasattr(obj, "canonical") else obj.to_dict()


def _apply_op(kind, obj, rng):
    """Apply one random local operation; return the counter delta it caused."""
    if kind == "gcounter":
        n = rng.randint(1, 5)
        obj.increment(n)
        return n
    if kind == "pncounter":
        n = rng.randint(1, 5)
        if rng.random() < 0.4:
            obj.decrement(n)
            return -n
        obj.increment(n)
        return n
    if kind == "lwwmap":
        key, ts = rng.choice(KEYS), rng.randint(1, 30)
        if rng.random() < 0.3:
            obj.delete(key, ts)
        else:
            obj.set(key, rng.randint(0, 9), ts)
        return 0
    elem = rng.choice(ELEMS)
    if rng.random() < 0.4:
        obj.remove(elem)
    else:
        obj.add(elem)
    return 0


def _random_obj(kind, replica, rng):
    obj = KINDS[kind](replica)
    for _ in range(rng.randint(0, 6)):
        _apply_op(kind, obj, rng)
    return obj


def check_laws(kind, seed, trials=30, merge=None):
    merge = merge or (lambda a, b: a.merge(b))
    rng = random.Random(seed)
    problems = []
    for t in range(trials):
        a, b, c = (_random_obj(kind, r, rng) for r in "abc")
        if _state(merge(a, b)) != _state(merge(b, a)):
            problems.append("trial %d: merge not commutative" % t)
        if _state(merge(a, a)) != _state(a):
            problems.append("trial %d: merge not idempotent" % t)
        if _state(merge(merge(a, b), c)) != _state(merge(a, merge(b, c))):
            problems.append("trial %d: merge not associative" % t)
    return problems


@dataclass(frozen=True)
class Report:
    converged: bool
    rounds: int
    digest: str
    expected: int
    value: int


@dataclass(frozen=True)
class PartitionReport:
    diverged_during_partition: bool
    converged_after_heal: bool
    rounds: int


def _build(kind, replicas):
    stores = []
    for i in range(replicas):
        s = Store("r%d" % i)
        s.register("obj", KINDS[kind](s.replica))
        stores.append(s)
    return stores


def _drive(kind, stores, rng, steps):
    total = 0
    for _ in range(steps):
        s = rng.choice(stores)
        delta = s.mutate("obj", lambda o: _apply_op(kind, o, rng))
        total += delta
        if rng.random() < 0.3:
            gossip_round(Network(stores), rng)
    return total


def _final_digest(net):
    return next(iter(net.stores.values())).digest()["obj"]


# @id CODE-CONVERGENCE-002 @implements REQ-CONVERGENCE-003 REQ-CONVERGENCE-004 REQ-CONVERGENCE-007
def run_convergence(kind, seed, replicas=4, steps=40, max_rounds=60):
    rng = random.Random(seed)
    stores = _build(kind, replicas)
    expected = _drive(kind, stores, rng, steps)
    net = Network(stores)
    rounds = run_until_converged(net, rng, max_rounds)
    ok = rounds is not None
    obj = stores[0].get("obj")
    value = obj.value if hasattr(obj, "value") else 0
    return Report(ok, rounds if ok else max_rounds, _final_digest(net), expected, value)


def _distinct_change(kind, store, tag):
    def op(obj):
        if kind in ("gcounter", "pncounter"):
            obj.increment(1)
        elif kind == "lwwmap":
            obj.set("part-" + tag, tag, 1000)
        else:
            obj.add("part-" + tag)
    store.mutate("obj", op)


# @id CODE-CONVERGENCE-003 @implements REQ-CONVERGENCE-005
def run_partition(kind, seed, replicas=4, steps=20, max_rounds=60):
    rng = random.Random(seed)
    stores = _build(kind, replicas)
    net = Network(stores)
    half = replicas // 2
    net.partition([s.replica for s in stores[:half]], [s.replica for s in stores[half:]])
    _distinct_change(kind, stores[0], "left")
    _distinct_change(kind, stores[-1], "right")
    for _ in range(steps):
        gossip_round(net, rng)
    diverged = not converged(net)
    net.heal()
    rounds = run_until_converged(net, rng, max_rounds)
    return PartitionReport(diverged, rounds is not None, rounds or 0)


# @id CODE-CONVERGENCE-004 @implements REQ-CONVERGENCE-006
def replay_unchanged(kind, seed, replicas=4, steps=30):
    rng = random.Random(seed)
    stores = _build(kind, replicas)
    _drive(kind, stores, rng, steps)
    net = Network(stores)
    run_until_converged(net, rng, 60)
    before = {s.replica: s.digest() for s in stores}
    replays = 0
    for s in stores:
        for other in stores:
            if other is not s:
                k, data = other.export("obj")
                s.absorb("obj", k, data)
                s.absorb("obj", k, data)
                replays += 2
    after = {s.replica: s.digest() for s in stores}
    return before, after, replays

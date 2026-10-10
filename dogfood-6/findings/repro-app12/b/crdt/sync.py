"""Anti-entropy between stores of named CRDTs."""
import hashlib
import json

from crdt.counters import GCounter, PNCounter
from crdt.lwwmap import LWWMap
from crdt.orset import ORSet
from crdt.vclock import VClock

KINDS = {"gcounter": GCounter, "pncounter": PNCounter, "lwwmap": LWWMap, "orset": ORSet}


class SyncError(Exception):
    pass


class PartitionError(Exception):
    pass


def kind_of(obj):
    for name, cls in KINDS.items():
        if type(obj) is cls:
            return name
    raise TypeError("unsupported CRDT type %s" % type(obj).__name__)


def _state(obj):
    return obj.canonical() if hasattr(obj, "canonical") else obj.to_dict()


def _hash(kind, data):
    blob = json.dumps([kind, data], sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode()).hexdigest()


class Store:
    # @id CODE-SYNC-001 @implements REQ-SYNC-001 REQ-SYNC-002
    def __init__(self, replica):
        self.replica = replica
        self.clock = VClock()
        self._objs = {}

    def register(self, name, obj):
        self._objs[name] = (kind_of(obj), obj)

    def get(self, name):
        return self._objs[name][1]

    def names(self):
        return sorted(self._objs)

    def mutate(self, name, fn):
        obj = self._objs[name][1]
        result = fn(obj)
        self.clock = self.clock.increment(self.replica)
        return result

    # @id CODE-SYNC-002 @implements REQ-SYNC-003
    def digest(self):
        return {n: _hash(k, _state(o)) for n, (k, o) in self._objs.items()}

    def export(self, name):
        kind, obj = self._objs[name]
        return kind, obj.to_dict()

    def absorb(self, name, kind, data):
        if name in self._objs:
            mine, obj = self._objs[name]
            if mine != kind:
                raise SyncError("kind mismatch for %s: %s vs %s" % (name, mine, kind))
            self._objs[name] = (kind, obj.merge(KINDS[kind].from_dict(data, self.replica)))
        else:
            self._objs[name] = (kind, KINDS[kind].from_dict(data, self.replica))


# @id CODE-SYNC-003 @implements REQ-SYNC-004
def diff(a, b):
    return sorted(n for n in set(a) | set(b) if a.get(n) != b.get(n))


# @id CODE-SYNC-004 @implements REQ-SYNC-005 REQ-SYNC-006 REQ-SYNC-007 REQ-SYNC-008 REQ-SYNC-009 REQ-SYNC-012
def _check_kinds(a, b, names):
    for n in names:
        if n in a._objs and n in b._objs and a._objs[n][0] != b._objs[n][0]:
            raise SyncError("kind mismatch for %s" % n)


def sync_pair(a, b):
    names = diff(a.digest(), b.digest())
    _check_kinds(a, b, names)
    ea = {n: a.export(n) for n in names if n in a._objs}
    eb = {n: b.export(n) for n in names if n in b._objs}
    for n, (k, d) in eb.items():
        a.absorb(n, k, d)
    for n, (k, d) in ea.items():
        b.absorb(n, k, d)
    merged = a.clock.merge(b.clock)
    a.clock = b.clock = merged
    return len(names)


class Network:
    # @id CODE-SYNC-005 @implements REQ-SYNC-010
    def __init__(self, stores):
        self.stores = {s.replica: s for s in stores}
        self._group = {r: 0 for r in self.stores}

    def partition(self, *groups):
        self._group = {r: 0 for r in self.stores}
        for i, g in enumerate(groups, 1):
            for r in g:
                self._group[r] = i

    def heal(self):
        self._group = {r: 0 for r in self.stores}

    def reachable(self, x, y):
        return self._group[x] == self._group[y]

    def sync(self, x, y):
        if not self.reachable(x, y):
            raise PartitionError("%s and %s are partitioned" % (x, y))
        return sync_pair(self.stores[x], self.stores[y])


def converged(net):
    digests = [s.digest() for s in net.stores.values()]
    return all(d == digests[0] for d in digests)


# @id CODE-SYNC-006 @implements REQ-SYNC-011
def gossip_round(net, rng):
    ids = sorted(net.stores)
    rng.shuffle(ids)
    for x in ids:
        peers = [y for y in sorted(net.stores) if y != x and net.reachable(x, y)]
        if peers:
            net.sync(x, rng.choice(peers))


def run_until_converged(net, rng, max_rounds):
    if converged(net):
        return 0
    for rounds in range(1, max_rounds + 1):
        gossip_round(net, rng)
        if converged(net):
            return rounds
    return None

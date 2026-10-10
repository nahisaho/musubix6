"""State-based G-Counter and PN-Counter."""


def _check_n(n):
    if isinstance(n, bool) or not isinstance(n, int) or n <= 0:
        raise ValueError("amount must be a positive int")


def _check_slots(slots):
    out = {}
    for r, c in dict(slots).items():
        if not isinstance(r, str) or not r:
            raise ValueError("replica id must be a non-empty str")
        if isinstance(c, bool) or not isinstance(c, int) or c < 0:
            raise ValueError("slot must be a non-negative int")
        if c:
            out[r] = c
    return out


def _canon(slots):
    return {r: slots[r] for r in sorted(slots)}


def _join(a, b):
    out = dict(a)
    for r, c in b.items():
        out[r] = max(out.get(r, 0), c)
    return out


class GCounter:
    # @id CODE-COUNTERS-001 @implements REQ-COUNTERS-001 REQ-COUNTERS-002
    def __init__(self, replica, slots=None):
        self.replica = replica
        self._slots = _check_slots(slots or {})

    def increment(self, n=1):
        _check_n(n)
        self._slots[self.replica] = self._slots.get(self.replica, 0) + n

    @property
    def value(self):
        return sum(self._slots.values())

    # @id CODE-COUNTERS-002 @implements REQ-COUNTERS-003 REQ-COUNTERS-004 REQ-COUNTERS-005 REQ-COUNTERS-009
    def merge(self, other):
        if not isinstance(other, GCounter):
            raise TypeError("cannot merge GCounter with %s" % type(other).__name__)
        return GCounter(self.replica, _join(self._slots, other._slots))

    # @id CODE-COUNTERS-003 @implements REQ-COUNTERS-008
    def to_dict(self):
        return _canon(self._slots)

    @classmethod
    def from_dict(cls, data, replica):
        return cls(replica, data)


class PNCounter:
    # @id CODE-COUNTERS-004 @implements REQ-COUNTERS-006
    def __init__(self, replica, p=None, n=None):
        self.replica = replica
        self._p = GCounter(replica, p)
        self._n = GCounter(replica, n)

    def increment(self, n=1):
        self._p.increment(n)

    def decrement(self, n=1):
        self._n.increment(n)

    @property
    def value(self):
        return self._p.value - self._n.value

    # @id CODE-COUNTERS-005 @implements REQ-COUNTERS-007
    def merge(self, other):
        if not isinstance(other, PNCounter):
            raise TypeError("cannot merge PNCounter with %s" % type(other).__name__)
        return PNCounter(self.replica, self._p.merge(other._p)._slots, self._n.merge(other._n)._slots)

    def to_dict(self):
        return {"p": self._p.to_dict(), "n": self._n.to_dict()}

    @classmethod
    def from_dict(cls, data, replica):
        return cls(replica, data.get("p"), data.get("n"))

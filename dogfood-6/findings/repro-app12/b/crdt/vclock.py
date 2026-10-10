"""Immutable vector clock."""


def _validate(entries):
    out = {}
    for replica, count in dict(entries).items():
        if not isinstance(replica, str) or not replica:
            raise ValueError("replica id must be a non-empty str")
        if isinstance(count, bool) or not isinstance(count, int) or count < 0:
            raise ValueError("count must be a non-negative int")
        if count:
            out[replica] = count
    return tuple(sorted(out.items()))


class VClock:
    __slots__ = ("_items",)

    # @id CODE-VCLOCK-001 @implements REQ-VCLOCK-001 REQ-VCLOCK-006 REQ-VCLOCK-007
    def __init__(self, entries=None):
        object.__setattr__(self, "_items", _validate(entries or {}))

    def __setattr__(self, name, value):
        raise AttributeError("VClock is immutable")

    def _d(self):
        return dict(self._items)

    # @id CODE-VCLOCK-007 @implements REQ-VCLOCK-011
    def increment(self, replica, n=1):
        if isinstance(n, bool) or not isinstance(n, int) or n <= 0:
            raise ValueError("n must be a positive int")
        d = self._d()
        d[replica] = d.get(replica, 0) + n
        return VClock(d)

    # @id CODE-VCLOCK-002 @implements REQ-VCLOCK-002
    def get(self, replica):
        return self._d().get(replica, 0)

    # @id CODE-VCLOCK-003 @implements REQ-VCLOCK-003 REQ-VCLOCK-004
    def merge(self, other):
        d = self._d()
        for r, c in other._items:
            d[r] = max(d.get(r, 0), c)
        return VClock(d)

    # @id CODE-VCLOCK-004 @implements REQ-VCLOCK-005 REQ-VCLOCK-008
    def compare(self, other):
        a, b = self._d(), other._d()
        le = all(c <= b.get(r, 0) for r, c in a.items())
        ge = all(c <= a.get(r, 0) for r, c in b.items())
        if le and ge:
            return "equal"
        if le:
            return "before"
        if ge:
            return "after"
        return "concurrent"

    def dominates(self, other):
        return self.compare(other) in ("after", "equal")

    def __eq__(self, other):
        return isinstance(other, VClock) and self._items == other._items

    def __hash__(self):
        return hash(self._items)

    def __repr__(self):
        return "VClock(%r)" % (self.to_dict(),)

    # @id CODE-VCLOCK-005 @implements REQ-VCLOCK-009
    def to_dict(self):
        return dict(self._items)

    @classmethod
    def from_dict(cls, data):
        return cls(data)

    # @id CODE-VCLOCK-006 @implements REQ-VCLOCK-010
    def prune(self, keep):
        return VClock({r: c for r, c in self._items if r in keep})

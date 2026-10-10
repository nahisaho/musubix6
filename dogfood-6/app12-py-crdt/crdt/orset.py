"""Observed-remove set (add-wins) with per-replica tags."""
import json

from crdt.vclock import VClock


def _key(elem):
    return json.dumps(elem, sort_keys=True)


class ORSet:
    # @id CODE-ORSET-001 @implements REQ-ORSET-001 REQ-ORSET-008
    def __init__(self, replica, adds=None, removed=None, seq=0):
        self.replica = replica
        self._adds = {e: set(t) for e, t in (adds or {}).items()}
        self._removed = set(removed or ())
        self._seq = max(seq, self._max_own_seq())

    def _all_tags(self):
        tags = set(self._removed)
        for t in self._adds.values():
            tags |= t
        return tags

    def _max_own_seq(self):
        return max((s for r, s in self._all_tags() if r == self.replica), default=0)

    def add(self, elem):
        hash(elem)
        self._seq += 1
        tag = (self.replica, self._seq)
        self._adds.setdefault(elem, set()).add(tag)
        return tag

    # @id CODE-ORSET-002 @implements REQ-ORSET-002 REQ-ORSET-006
    def contains(self, elem):
        return bool(self._adds.get(elem, set()) - self._removed)

    __contains__ = contains

    def elements(self):
        return sorted((e for e in self._adds if self.contains(e)), key=_key)

    # @id CODE-ORSET-003 @implements REQ-ORSET-003 REQ-ORSET-005
    def remove(self, elem):
        live = self._adds.get(elem, set()) - self._removed
        if not live:
            return False
        self._removed |= live
        return True

    # @id CODE-ORSET-004 @implements REQ-ORSET-004 REQ-ORSET-007
    def merge(self, other):
        adds = {e: set(t) for e, t in self._adds.items()}
        for e, t in other._adds.items():
            adds.setdefault(e, set()).update(t)
        return ORSet(self.replica, adds, self._removed | other._removed, self._seq)

    # @id CODE-ORSET-005 @implements REQ-ORSET-009
    def compact(self):
        dropped = 0
        for e in list(self._adds):
            keep = self._adds[e] - self._removed
            dropped += len(self._adds[e]) - len(keep)
            if keep:
                self._adds[e] = keep
            else:
                del self._adds[e]
        return dropped

    # @id CODE-ORSET-006 @implements REQ-ORSET-010
    def context(self):
        top = {}
        for r, s in self._all_tags():
            top[r] = max(top.get(r, 0), s)
        return VClock(top)

    # @id CODE-ORSET-007 @implements REQ-ORSET-011
    def to_dict(self):
        adds = [[e, sorted([r, s] for r, s in self._adds[e])] for e in sorted(self._adds, key=_key)]
        return {"adds": adds, "removed": sorted([r, s] for r, s in self._removed), "seq": self._seq}

    # @id CODE-ORSET-008 @implements REQ-ORSET-012
    def canonical(self):
        d = self.to_dict()
        return {"adds": d["adds"], "removed": d["removed"]}

    @classmethod
    def from_dict(cls, data, replica):
        adds = {e: {tuple(t) for t in tags} for e, tags in data["adds"]}
        return cls(replica, adds, {tuple(t) for t in data["removed"]}, data["seq"])

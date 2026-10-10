"""Last-writer-wins map with tombstones."""
import json


def _canon(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _order(entry):
    ts, replica, deleted, value = entry
    return (ts, replica, deleted, _canon(value))


def _pick(a, b):
    if a is None:
        return b
    return a if _order(a) >= _order(b) else b


class LWWMap:
    # @id CODE-LWWMAP-001 @implements REQ-LWWMAP-001 REQ-LWWMAP-006
    def __init__(self, replica, entries=None):
        self.replica = replica
        self._e = dict(entries or {})

    # @id CODE-LWWMAP-006 @implements REQ-LWWMAP-011
    def _write(self, key, ts, deleted, value):
        if not isinstance(key, str):
            raise TypeError("key must be str")
        if isinstance(ts, bool) or not isinstance(ts, int):
            raise ValueError("ts must be int")
        entry = (ts, self.replica, deleted, value)
        cur = self._e.get(key)
        if cur is not None and (entry[0], entry[1]) <= (cur[0], cur[1]):
            return False
        self._e[key] = entry
        return True

    def set(self, key, value, ts):
        return self._write(key, ts, False, value)

    def get(self, key, default=None):
        e = self._e.get(key)
        if e is None or e[2]:
            return default
        return e[3]

    # @id CODE-LWWMAP-002 @implements REQ-LWWMAP-004 REQ-LWWMAP-005
    def delete(self, key, ts):
        return self._write(key, ts, True, None)

    def keys(self):
        return sorted(k for k, e in self._e.items() if not e[2])

    def items(self):
        return [(k, self._e[k][3]) for k in self.keys()]

    # @id CODE-LWWMAP-003 @implements REQ-LWWMAP-002 REQ-LWWMAP-003 REQ-LWWMAP-007 REQ-LWWMAP-008
    def merge(self, other):
        out = dict(self._e)
        for k, e in other._e.items():
            out[k] = _pick(out.get(k), e)
        return LWWMap(self.replica, out)

    # @id CODE-LWWMAP-004 @implements REQ-LWWMAP-009
    def gc(self, before_ts):
        dead = [k for k, e in self._e.items() if e[2] and e[0] < before_ts]
        for k in dead:
            del self._e[k]
        return len(dead)

    # @id CODE-LWWMAP-005 @implements REQ-LWWMAP-010
    def to_dict(self):
        return {k: [e[0], e[1], e[2], e[3]] for k, e in sorted(self._e.items())}

    @classmethod
    def from_dict(cls, data, replica):
        return cls(replica, {k: (v[0], v[1], v[2], v[3]) for k, v in data.items()})

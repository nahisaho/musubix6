from copy import deepcopy
from dataclasses import replace
import math


def combine(a, b):
    total = a["sum"] + b["sum"]
    if not math.isfinite(total):
        raise ValueError("aggregate overflow")
    return {"count": a["count"] + b["count"], "sum": total,
            "min": min(a["min"], b["min"]), "max": max(a["max"], b["max"])}


def singleton(value):
    if not math.isfinite(value):
        raise ValueError("value must be finite")
    return {"count": 1, "sum": value, "min": value, "max": value}


def accumulate(current, value):
    item = singleton(value)
    return item if current is None else combine(current, item)


# @id CODE-STATE-001 @implements REQ-STATE-001 REQ-STATE-002 REQ-STATE-003 REQ-STATE-006 REQ-STATE-007 REQ-STATE-008 REQ-STATE-009
class KeyedState:
    def __init__(self):
        self.values = {}

    def apply(self, event):
        new = accumulate(self.values.get(event.key), event.value)
        self.values[event.key] = new
        return deepcopy(new)

    def get(self, key):
        return deepcopy(self.values.get(key))

    def delete(self, key):
        self.values.pop(key, None)

    def export(self):
        return deepcopy(self.values)


# @id CODE-STATE-002 @implements REQ-STATE-004
def filter_event(event, predicate):
    return event if predicate(event) else None


# @id CODE-STATE-003 @implements REQ-STATE-005
def map_event(event, mapper):
    return replace(event, value=mapper(event.value))

import math
from .clock import Event
from .windows import tumbling, sliding, Sessions, positive
from .state import singleton, combine


# @id CODE-FLOW-001 @implements REQ-FLOW-001 REQ-FLOW-002 REQ-FLOW-003 REQ-FLOW-004 REQ-FLOW-005 REQ-FLOW-006 REQ-FLOW-007 REQ-FLOW-008 REQ-FLOW-009 REQ-FLOW-010
class Engine:
    def __init__(self, mode="tumbling", size=10, slide=5, gap=5, late_policy="drop"):
        if mode not in ("tumbling", "sliding", "session") or late_policy not in ("drop", "side", "error"):
            raise ValueError("unknown window mode or late policy")
        positive(size)
        positive(slide)
        positive(gap)
        self.options = dict(mode=mode, size=size, slide=slide, gap=gap, late_policy=late_policy)
        self.watermark = -math.inf
        self.windows = {}
        self.sessions = Sessions(gap)
        self.dropped = 0
        self.late = []

    def process(self, event: Event):
        value = singleton(event.value)
        if event.timestamp < self.watermark:
            policy = self.options["late_policy"]
            if policy == "error":
                raise ValueError("late event")
            if policy == "drop":
                self.dropped += 1
            else:
                self.late.append(event)
            return False
        mode = self.options["mode"]
        candidate = dict(self.windows)
        if mode == "session":
            proposed = Sessions(self.options["gap"])
            proposed.windows = {k: list(v) for k, v in self.sessions.windows.items()}
            start, end = proposed.add(event.key, event.timestamp)
            overlaps = [k for k in candidate if k[0] == event.key and k[1] <= end and k[2] >= start]
            for key in overlaps:
                value = combine(candidate.pop(key), value)
            candidate[(event.key, start, end)] = value
            self.sessions = proposed
        else:
            intervals = (tumbling(event.timestamp, self.options["size"]) if mode == "tumbling"
                         else sliding(event.timestamp, self.options["size"], self.options["slide"]))
            for start, end in intervals:
                key = (event.key, start, end)
                candidate[key] = combine(candidate[key], value) if key in candidate else value
        self.windows = candidate
        return True

    def advance(self, watermark):
        if not math.isfinite(watermark) or watermark < self.watermark:
            raise ValueError("invalid watermark")
        self.watermark = watermark
        closed = sorted((k for k in self.windows if k[2] <= watermark), key=lambda k: (k[2], k[0], k[1]))
        result = [dict(key=k[0], start=k[1], end=k[2], **self.windows.pop(k)) for k in closed]
        self.sessions.close(watermark)
        return result

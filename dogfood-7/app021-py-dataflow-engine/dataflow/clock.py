from dataclasses import dataclass
import math


# @id CODE-CLOCK-001 @implements REQ-CLOCK-001 REQ-CLOCK-002
@dataclass(frozen=True)
class Event:
    timestamp: float
    key: str
    value: float
    partition: str = "default"

    def __post_init__(self):
        if not math.isfinite(self.timestamp):
            raise ValueError("event timestamp must be finite")


# @id CODE-CLOCK-002 @implements REQ-CLOCK-003 REQ-CLOCK-004 REQ-CLOCK-005 REQ-CLOCK-006 REQ-CLOCK-007 REQ-CLOCK-008
class Clock:
    def __init__(self, partitions, lag=0):
        if not math.isfinite(lag) or lag < 0 or not partitions:
            raise ValueError("positive partition count and nonnegative finite lag required")
        self.maxima = dict.fromkeys(partitions, -math.inf)
        self.idle = set()
        self.lag = lag
        self.watermark = -math.inf

    def _partition(self, partition):
        if partition not in self.maxima:
            raise ValueError("unknown partition")

    def _update(self):
        active = [v for p, v in self.maxima.items() if p not in self.idle]
        if active:
            self.watermark = max(self.watermark, min(active) - self.lag)
        return self.watermark

    def observe(self, event):
        self._partition(event.partition)
        self.maxima[event.partition] = max(self.maxima[event.partition], event.timestamp)
        return self._update()

    def set_idle(self, partition, idle):
        self._partition(partition)
        if idle:
            self.idle.add(partition)
        else:
            self.idle.discard(partition)
        return self._update()

    def advance(self, watermark):
        if not math.isfinite(watermark) or watermark < self.watermark:
            raise ValueError("invalid watermark")
        self.watermark = watermark
        return watermark

    def is_late(self, event):
        return event.timestamp < self.watermark

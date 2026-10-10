import math
from decimal import Decimal, ROUND_FLOOR, localcontext


def positive(value):
    if not math.isfinite(value) or value <= 0:
        raise ValueError("window parameters must be positive and finite")


def checked(value):
    if not math.isfinite(value):
        raise ValueError("window arithmetic overflow")
    return value


# @id CODE-WINDOW-001 @implements REQ-WINDOW-001 REQ-WINDOW-003 REQ-WINDOW-009 REQ-WINDOW-010
def tumbling(timestamp, size):
    positive(size)
    checked(timestamp / size)
    with localcontext() as context:
        context.prec = 80
        t, width = Decimal(str(timestamp)), Decimal(str(size))
        index = (t / width).to_integral_value(rounding=ROUND_FLOOR)
        start, end = checked(float(index * width)), checked(float((index + 1) * width))
    if not start <= timestamp < end:
        raise ValueError("window resolution below timestamp precision")
    return [(start, end)]


# @id CODE-WINDOW-002 @implements REQ-WINDOW-002 REQ-WINDOW-010
def sliding(timestamp, size, slide):
    positive(size)
    positive(slide)
    checked(timestamp / slide)
    checked((timestamp - size) / slide)
    with localcontext() as context:
        context.prec = 80
        t, width, step = map(lambda v: Decimal(str(v)), (timestamp, size, slide))
        last = int((t / step).to_integral_value(rounding=ROUND_FLOOR))
        first = int(((t - width) / step).to_integral_value(rounding=ROUND_FLOOR)) + 1
        intervals = [(checked(float(i * step)), checked(float(i * step + width))) for i in range(first, last + 1)]
    if any(not a <= timestamp < b for a, b in intervals):
        raise ValueError("window resolution below timestamp precision")
    return intervals


# @id CODE-WINDOW-003 @implements REQ-WINDOW-004 REQ-WINDOW-005 REQ-WINDOW-006 REQ-WINDOW-007 REQ-WINDOW-008 REQ-WINDOW-009
class Sessions:
    def __init__(self, gap):
        positive(gap)
        self.gap = gap
        self.windows = {}

    def add(self, key, timestamp):
        start, end = checked(timestamp), checked(timestamp + self.gap)
        kept = []
        for left, right in self.windows.get(key, []):
            if left <= end and right >= start:
                start, end = min(start, left), max(end, right)
            else:
                kept.append((left, right))
        self.windows[key] = sorted(kept + [(start, end)])
        return start, end

    def intervals(self, key):
        return list(self.windows.get(key, []))

    def close(self, watermark):
        closed = []
        for key, intervals in list(self.windows.items()):
            closed.extend((key, a, b) for a, b in intervals if b <= watermark)
            kept = [(a, b) for a, b in intervals if b > watermark]
            if kept:
                self.windows[key] = kept
            else:
                del self.windows[key]
        return sorted(closed, key=lambda row: (row[2], row[0], row[1]))

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from threading import Barrier, Lock
from zoneinfo import ZoneInfo
import heapq

zone = ZoneInfo("America/New_York")
gap = datetime(2026, 3, 8, 7, 30, tzinfo=timezone.utc).astimezone(zone)
assert gap.hour == 3
folds = [datetime(2026, 11, 1, h, 30, tzinfo=timezone.utc).astimezone(zone) for h in (5, 6)]
assert [x.hour for x in folds] == [1, 1]
assert [x.fold for x in folds] == [0, 1]
heap = []
for sequence in (2, 0, 1):
    heapq.heappush(heap, (folds[0].astimezone(timezone.utc), sequence))
assert [heapq.heappop(heap)[1] for _ in range(3)] == [0, 1, 2]
lock, barrier, acquired = Lock(), Barrier(8), []
def attempt(i):
    barrier.wait()
    with lock:
        if not acquired:
            acquired.append(i)
with ThreadPoolExecutor(max_workers=8) as pool:
    list(pool.map(attempt, range(8)))
assert len(acquired) == 1
print("spike: DST gap/folds, UTC heap ties, atomic contention verified")

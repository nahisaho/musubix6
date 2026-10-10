from dataclasses import dataclass, field
from threading import RLock
import heapq
from scheduler.clock import utc


@dataclass(frozen=True)
class Work:
    id: str
    due: object
    priority: int
    payload: object
    generation: int


@dataclass
class ReadyQueue:
    delayed: list = field(default_factory=list)
    ready: list = field(default_factory=list)
    entries: dict = field(default_factory=dict)
    sequence: int = 0
    queried_at: object = None
    lock: object = field(default_factory=RLock)


# @id CODE-QUEUE-001 @implements REQ-QUEUE-001
def create_queue():
    return ReadyQueue()


# @id CODE-QUEUE-002 @implements REQ-QUEUE-004 REQ-QUEUE-006 REQ-QUEUE-008
def push(queue, id, due, priority=0, payload=None):
    due = utc(due)
    if not isinstance(id, str) or not id or isinstance(priority, bool) or not isinstance(priority, int):
        raise ValueError("invalid work identity or priority")
    with queue.lock:
        if id in queue.entries:
            return False
        queue.sequence += 1
        work = Work(id, due, priority, payload, queue.sequence)
        queue.entries[id] = work
        heapq.heappush(queue.delayed, (due, work.generation, id))
        return True


# @id CODE-QUEUE-003 @implements REQ-QUEUE-001 REQ-QUEUE-002 REQ-QUEUE-003 REQ-QUEUE-006 REQ-QUEUE-009
def pop(queue, instant):
    instant = utc(instant)
    with queue.lock:
        if queue.queried_at is not None and instant < queue.queried_at:
            raise ValueError("query instant must be monotonic")
        queue.queried_at = instant
        while queue.delayed and queue.delayed[0][0] <= instant:
            due, generation, id = heapq.heappop(queue.delayed)
            work = queue.entries.get(id)
            if work and work.generation == generation:
                heapq.heappush(queue.ready, (-work.priority, due, generation, id))
        while queue.ready:
            _, _, generation, id = heapq.heappop(queue.ready)
            work = queue.entries.get(id)
            if work and work.generation == generation:
                del queue.entries[id]
                return work
        return None


# @id CODE-QUEUE-004 @implements REQ-QUEUE-005 REQ-QUEUE-006
def discard(queue, id):
    with queue.lock:
        return queue.entries.pop(id, None) is not None


# @id CODE-QUEUE-005 @implements REQ-QUEUE-007
def size(queue):
    with queue.lock:
        return len(queue.entries)

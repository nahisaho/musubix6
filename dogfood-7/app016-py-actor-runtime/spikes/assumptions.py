from collections import deque
from copy import deepcopy
import heapq

queue = deque([1, 2])
assert [queue.popleft(), queue.popleft()] == [1, 2]
original = {"items": [1]}
snapshot = deepcopy(original)
original["items"].append(2)
assert snapshot == {"items": [1]}
heap = []
for sequence in range(3):
    heapq.heappush(heap, (2, sequence, {"payload": sequence}))
assert [heapq.heappop(heap)[1] for _ in range(3)] == [0, 1, 2]
assert ["a", "b", "c"][1:] == ["b", "c"]
assert [t for t in [1, 2, 5] if 5 - t <= 2] == [5]
print("five runtime assumptions verified")
names, cursor, trace = ["a", "b"], 0, []
for _ in range(4):
    trace.append(names[cursor])
    cursor = (cursor + 1) % len(names)
assert trace == ["a", "b", "a", "b"]
def reachable(graph, start):
    seen, todo = set(), list(graph.get(start, []))
    while todo:
        node = todo.pop()
        if node not in seen:
            seen.add(node)
            todo.extend(graph.get(node, []))
    return seen

def components(graph):
    groups = {tuple(sorted(n for n in graph if n in reachable(graph, root)
                           and root in reachable(graph, n))) for root in graph}
    return sorted(group for group in groups if group)

assert components({"a": {"a"}}) == [("a",)]
assert components({"a": {"b"}, "b": {"a", "c"}, "c": {"b"}}) == [("a", "b", "c")]

class QueueActor:
    def __init__(self):
        self.pending, self.state = deque([1, 2]), "alive"

    def step(self):
        return self.pending.popleft() if self.state == "alive" and self.pending else None

    def exhaust(self, parent):
        self.state = "suspended" if parent else "stopped"
        if parent:
            assert self.step() is None
            parent(self)
        else:
            self.pending.clear()

actor = QueueActor()
actor.exhaust(lambda child: setattr(child, "state", "alive"))
assert actor.step() == 1 and actor.step() == 2
actor = QueueActor()
actor.exhaust(None)
assert not actor.pending and actor.step() is None

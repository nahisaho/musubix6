import heapq
from .mailbox import snapshot
from .scheduler import Runtime


# @id CODE-REMOTING-001 @implements REQ-REMOTING-001 REQ-REMOTING-002 REQ-REMOTING-003 REQ-REMOTING-004 REQ-REMOTING-005 REQ-REMOTING-006 REQ-REMOTING-007 REQ-REMOTING-008 REQ-REMOTING-009
class Network:
    def __init__(self, latency=1):
        if latency < 0:
            raise ValueError("latency must be nonnegative")
        self.latency, self.time, self.sequence = latency, 0, 0
        self.nodes = {}
        self.pending = []
        self.partitions = set()
        self.dead_letters = []

    def register(self, name, runtime: Runtime):
        if name in self.nodes:
            raise ValueError("duplicate node")
        self.nodes[name] = runtime

    def send(self, source, destination, actor, payload):
        if source not in self.nodes:
            raise ValueError("unknown source")
        if payload is None:
            raise TypeError("None is reserved for empty")
        value = snapshot(payload)
        heapq.heappush(self.pending, (
            self.time + self.latency, self.sequence, source, destination, actor, value
        ))
        self.sequence += 1

    def partition(self, first, second):
        self.partitions.add(frozenset((first, second)))

    def heal(self, first, second):
        self.partitions.discard(frozenset((first, second)))

    def advance(self, delta):
        if delta < 0:
            raise ValueError("time cannot go backwards")
        self.time += delta
        delivered = 0
        while self.pending and self.pending[0][0] <= self.time:
            event = heapq.heappop(self.pending)
            _, _, source, destination, actor, payload = event
            runtime = self.nodes.get(destination)
            if frozenset((source, destination)) in self.partitions:
                self.dead_letters.append((event, "partition"))
            elif runtime is None or not runtime.send(actor, payload):
                self.dead_letters.append((event, "unavailable"))
            else:
                delivered += 1
        return delivered

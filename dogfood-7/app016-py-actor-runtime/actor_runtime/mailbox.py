from collections import deque


# @id CODE-MAILBOX-002 @implements REQ-MAILBOX-009
def snapshot(value):
    holder, active = [None], set()
    stack = [(value, holder, 0, False)]
    while stack:
        source, destination, key, exiting = stack.pop()
        if exiting:
            active.remove(id(source))
            continue
        if type(source) in (str, bool, int, float, type(None)):
            destination[key] = source
            continue
        if type(source) not in (list, dict) or id(source) in active:
            raise TypeError("payload must be acyclic JSON-like builtins")
        if type(source) is dict:
            if any(type(k) is not str for k in source):
                raise TypeError("payload keys must be strings")
            clone = {}
            entries = list(source.items())
        else:
            clone = [None] * len(source)
            entries = list(enumerate(source))
        destination[key] = clone
        active.add(id(source))
        stack.append((source, None, None, True))
        for child_key, child in reversed(entries):
            stack.append((child, clone, child_key, False))
    return holder[0]


# @id CODE-MAILBOX-001 @implements REQ-MAILBOX-001 REQ-MAILBOX-002 REQ-MAILBOX-003 REQ-MAILBOX-004 REQ-MAILBOX-005 REQ-MAILBOX-006 REQ-MAILBOX-007 REQ-MAILBOX-008
class Mailbox:
    def __init__(self, capacity=1024):
        if capacity <= 0:
            raise ValueError("capacity must be positive")
        self.capacity = capacity
        self.queue = deque()
        self.closed = False

    @property
    def size(self):
        return len(self.queue)

    def send(self, payload):
        if self.closed or self.size >= self.capacity:
            return False
        if payload is None:
            raise TypeError("None is reserved for empty")
        self.queue.append(snapshot(payload))
        return True

    def close(self):
        self.closed = True

    def receive(self):
        return self.queue.popleft() if self.queue else None

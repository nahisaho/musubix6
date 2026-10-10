from dataclasses import dataclass
from .mailbox import Mailbox, snapshot


@dataclass
class Actor:
    handler: object
    mailbox: Mailbox
    state: str = "alive"
    owner: object = None


# @id CODE-SCHEDULER-001 @implements REQ-SCHEDULER-001 REQ-SCHEDULER-002 REQ-SCHEDULER-003 REQ-SCHEDULER-004 REQ-SCHEDULER-005 REQ-SCHEDULER-006 REQ-SCHEDULER-007 REQ-SCHEDULER-008 REQ-SCHEDULER-009
class Runtime:
    def __init__(self):
        self.actors = {}
        self.cursor = 0
        self.tick = 0
        self.trace = []
        self.blocked = set()
        self.failures = []

    def spawn(self, name, handler, capacity=1024, owner=None):
        if name in self.actors:
            raise ValueError("duplicate actor name")
        if not callable(handler):
            raise TypeError("handler must be callable")
        self.actors[name] = Actor(handler, Mailbox(capacity), owner=owner)

    def send(self, name, message):
        actor = self.actors.get(name)
        return bool(actor and actor.state == "alive" and actor.mailbox.send(message))

    def _next_ready(self):
        names = list(self.actors)
        for offset in range(len(names)):
            index = (self.cursor + offset) % len(names)
            name = names[index]
            actor = self.actors[name]
            if actor.state != "alive" or name in self.blocked or not actor.mailbox.size:
                continue
            self.cursor = index + 1
            return name, actor
        return None

    def step(self):
        ready = self._next_ready()
        if ready is None:
            return False
        name, actor = ready
        message = actor.mailbox.receive()
        self.tick += 1
        self.trace.append((name, snapshot(message)))
        try:
            actor.handler(self, name, message)
        except Exception as error:
            actor.state = "failed"
            self.failures.append((self.tick, name, str(error)))
            if actor.owner is not None:
                actor.owner.failed(name)
        return True

    def run(self, limit=1000):
        if limit < 0:
            raise ValueError("limit must be nonnegative")
        turns = 0
        while turns < limit and self.step():
            turns += 1
        return turns

    def stop(self, name):
        actor = self.actors[name]
        actor.state = "stopped"
        actor.mailbox.queue.clear()
        actor.mailbox.close()
        self.blocked.discard(name)

    def block(self, name):
        if name not in self.actors:
            raise KeyError(name)
        self.blocked.add(name)

    def unblock(self, name):
        self.blocked.discard(name)

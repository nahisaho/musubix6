from collections import deque
from .scheduler import Runtime
from .mailbox import Mailbox


# @id CODE-SUPERVISION-001 @implements REQ-SUPERVISION-001 REQ-SUPERVISION-002 REQ-SUPERVISION-003 REQ-SUPERVISION-004 REQ-SUPERVISION-005 REQ-SUPERVISION-006 REQ-SUPERVISION-007 REQ-SUPERVISION-008 REQ-SUPERVISION-009 REQ-SUPERVISION-010
class Supervisor:
    STRATEGIES = {"one-for-one", "one-for-all", "rest-for-one"}

    def __init__(self, runtime: Runtime, strategy="one-for-one", max_restarts=3, window=10):
        if strategy not in self.STRATEGIES or max_restarts < 0 or window < 0:
            raise ValueError("invalid supervision policy")
        self.runtime = runtime
        self.strategy = strategy
        self.max_restarts, self.window = max_restarts, window
        self.children = {}
        self.history = deque()
        self.exhausted = False
        self.parent = None
        self.parent_name = None

    def add_actor(self, name, factory, capacity=1024):
        if name in self.children:
            raise ValueError("duplicate child")
        self.runtime.spawn(name, factory(), capacity, owner=self)
        self.children[name] = factory

    def add_supervisor(self, name, child):
        if name in self.children or child.parent is not None or child.runtime is not self.runtime:
            raise ValueError("invalid supervisor child")
        ancestor = self
        while ancestor is not None:
            if ancestor is child:
                raise ValueError("supervision cycle")
            ancestor = ancestor.parent
        child.parent, child.parent_name = self, name
        self.children[name] = child

    def _suspend(self):
        for name, child in self.children.items():
            if isinstance(child, Supervisor):
                child._suspend()
            else:
                self.runtime.actors[name].state = "suspended"

    def _stop(self):
        self.exhausted = True
        for name, child in self.children.items():
            if isinstance(child, Supervisor):
                child._stop()
            else:
                self.runtime.stop(name)

    def _restart_child(self, name):
        child = self.children[name]
        if isinstance(child, Supervisor):
            child.exhausted = False
            child.history.clear()
            for grandchild in child.children:
                child._restart_child(grandchild)
        else:
            actor = self.runtime.actors[name]
            actor.handler = child()
            if actor.mailbox.closed:
                actor.mailbox = Mailbox(actor.mailbox.capacity)
            actor.state = "alive"
            self.runtime.unblock(name)

    def failed(self, name):
        if name not in self.children:
            raise KeyError(name)
        now = self.runtime.tick
        while self.history and now - self.history[0] > self.window:
            self.history.popleft()
        self.history.append(now)
        if len(self.history) > self.max_restarts:
            self.exhausted = True
            if self.parent is not None:
                self._suspend()
                self.parent.failed(self.parent_name)
            else:
                self._stop()
            return
        names = list(self.children)
        if self.strategy == "one-for-one":
            selected = [name]
        elif self.strategy == "one-for-all":
            selected = names
        else:
            selected = names[names.index(name):]
        for selected_name in selected:
            self._restart_child(selected_name)

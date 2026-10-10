from . import journal
from .errors import IllegalTransition
from .states import State, TRANSITIONS


class StateStore:
    def __init__(self, path):
        self._path = path
        self._state = {}
        self._history = {}
        self._seq = 0

    # @id CODE-STORE-006
    # @implements REQ-STORE-006
    @classmethod
    def open(cls, path):
        store = cls(path)
        for rec in journal.read_all(path):
            store._apply(rec)
        return store

    # @id CODE-STORE-010
    # @implements REQ-STORE-010
    def state(self, task):
        return self._state.get(task, State.PENDING)

    # @id CODE-STORE-002
    # @implements REQ-STORE-002 REQ-STORE-003
    def transition(self, task, new, detail=None):
        cur = self._check(task, new)
        rec = {"seq": self._seq + 1, "task": task, "from": cur.name, "to": new.name, "detail": detail}
        journal.append(self._path, rec)
        self._apply(rec)
        return rec

    def _check(self, task, new):
        cur = self.state(task)
        if new not in TRANSITIONS[cur]:
            raise IllegalTransition(f"{task}: {cur.name} -> {new.name}")
        return cur

    def _apply(self, rec):
        self._state[rec["task"]] = State(rec["to"])
        self._history.setdefault(rec["task"], []).append(rec)
        self._seq = max(self._seq, rec["seq"])

    # @id CODE-STORE-008
    # @implements REQ-STORE-008
    def history(self, task):
        return list(self._history.get(task, []))

    # @id CODE-STORE-009
    # @implements REQ-STORE-009
    def recover(self):
        stuck = [t for t, s in self._state.items() if s == State.RUNNING]
        for t in stuck:
            self.transition(t, State.RETRYING, detail={"recovered": True})
        return stuck

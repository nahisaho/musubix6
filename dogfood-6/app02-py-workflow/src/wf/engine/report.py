from dataclasses import dataclass, field

from wf.store.states import State


# @id CODE-ENGINE-009
# @implements REQ-ENGINE-009
@dataclass
class RunReport:
    states: dict = field(default_factory=dict)
    results: dict = field(default_factory=dict)

    @property
    def ok(self):
        return bool(self.states) and all(s == State.SUCCEEDED for s in self.states.values())

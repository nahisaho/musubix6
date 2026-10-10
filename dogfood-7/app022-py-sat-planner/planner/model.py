from dataclasses import dataclass


@dataclass(frozen=True)
class Action:
    name: str
    parameters: tuple = ()
    pre: frozenset = frozenset()
    add: frozenset = frozenset()
    delete: frozenset = frozenset()
    cost: int = 1

    # @id CODE-SYN-002 @implements REQ-SYN-006 REQ-SYN-007
    def __post_init__(self):
        if type(self.cost) is not int or self.cost <= 0:
            raise ValueError("action cost must be a positive integer")
        object.__setattr__(self, "parameters", tuple(self.parameters))
        for field in ("pre", "add", "delete"):
            object.__setattr__(self, field, frozenset(tuple(a) for a in getattr(self, field)))


@dataclass(frozen=True)
class Domain:
    name: str
    predicates: dict
    actions: tuple
    types: tuple = ("object",)


@dataclass(frozen=True)
class Problem:
    domain: str
    objects: dict
    initial: frozenset
    goal: frozenset


@dataclass(frozen=True)
class Task:
    actions: tuple
    initial: frozenset
    goal: frozenset


# @id CODE-GRD-002 @implements REQ-GRD-008
def apply(state, action):
    if not action.pre <= state:
        raise ValueError("unsatisfied preconditions")
    return frozenset((state - action.delete) | action.add)

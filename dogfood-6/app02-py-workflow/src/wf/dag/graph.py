from .errors import DuplicateTask, UnknownDependency
from . import algo


class Graph:
    def __init__(self):
        self._deps = {}

    # @id CODE-DAG-001
    # @implements REQ-DAG-001
    def add_task(self, task_id, deps=()):
        # @id CODE-DAG-002
        # @implements REQ-DAG-002
        if task_id in self._deps:
            raise DuplicateTask(task_id)
        self._deps[task_id] = list(deps)

    def tasks(self):
        return list(self._deps)

    def deps(self, task_id):
        return list(self._deps[task_id])

    # @id CODE-DAG-003
    # @implements REQ-DAG-003
    def validate(self):
        for tid, deps in self._deps.items():
            for d in deps:
                if d not in self._deps:
                    raise UnknownDependency(f"{tid} depends on unknown task {d}")

    # @id CODE-DAG-004
    # @implements REQ-DAG-004 REQ-DAG-005
    def find_cycle(self):
        return algo.find_cycle(self._deps)

    # @id CODE-DAG-006
    # @implements REQ-DAG-006 REQ-DAG-007
    def topological_order(self):
        return algo.topological_order(self._deps)

    # @id CODE-DAG-008
    # @implements REQ-DAG-008
    def layers(self):
        return algo.layers(self._deps)

    # @id CODE-DAG-009
    # @implements REQ-DAG-009
    def dependents(self, task_id):
        return algo.dependents(self._deps, task_id)

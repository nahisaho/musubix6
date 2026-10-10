class DagError(Exception):
    pass


class DuplicateTask(DagError):
    pass


class UnknownDependency(DagError):
    pass


class CycleError(DagError):
    def __init__(self, cycle):
        super().__init__("cycle: " + " -> ".join(cycle))
        self.cycle = list(cycle)

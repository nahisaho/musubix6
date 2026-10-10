# @id CODE-SAT-001 @implements REQ-SAT-001 REQ-SAT-002 REQ-SAT-003 REQ-SAT-004 REQ-SAT-005 REQ-SAT-006 REQ-SAT-007 REQ-SAT-008
class CDCL:
    """Deterministic first-UIP CDCL with exact, scan-based unit propagation."""

    def __init__(self, nvars, clauses):
        if type(nvars) is not int or nvars < 0:
            raise ValueError("nonnegative integer variable count required")
        self.nvars = nvars
        self.original = []
        for clause in clauses:
            clause = tuple(clause)
            if any(type(lit) is not int or not 1 <= abs(lit) <= nvars for lit in clause):
                raise ValueError("literal must be a nonzero declared integer")
            unique = tuple(dict.fromkeys(clause))
            if not any(-lit in unique for lit in unique):
                self.original.append(unique)
        self.stats = {}

    def _enqueue(self, lit, reason):
        var = abs(lit)
        self.assignment[var] = lit > 0
        self.levels[var] = self.level
        self.reasons[var] = reason
        self.trail.append(lit)

    def _propagate(self):
        changed = True
        while changed:
            changed = False
            for index, clause in enumerate(self.clauses):
                if any(self.assignment.get(abs(lit)) == (lit > 0)
                       for lit in clause if abs(lit) in self.assignment):
                    continue
                remaining = [lit for lit in clause if abs(lit) not in self.assignment]
                if not remaining:
                    return index
                if len(remaining) == 1:
                    self._enqueue(remaining[0], index)
                    self.stats["propagations"] += 1
                    changed = True
        return None

    def _analyze(self, conflict):
        learned = set(self.clauses[conflict])
        while sum(self.levels[abs(lit)] == self.level for lit in learned) > 1:
            pivot = next(lit for lit in reversed(self.trail)
                         if -lit in learned and self.levels[abs(lit)] == self.level)
            reason = self.reasons[abs(pivot)]
            if reason is None:
                raise AssertionError("first-UIP resolution reached decision too early")
            learned.remove(-pivot)
            learned.update(lit for lit in self.clauses[reason] if lit != pivot)
        asserting = next(lit for lit in learned if self.levels[abs(lit)] == self.level)
        rest = sorted(learned - {asserting}, key=lambda lit: (abs(lit), lit))
        target = max((self.levels[abs(lit)] for lit in rest), default=0)
        return tuple([asserting] + rest), target

    def _backtrack(self, target):
        while self.trail and self.levels[abs(self.trail[-1])] > target:
            var = abs(self.trail.pop())
            del self.assignment[var], self.levels[var], self.reasons[var]
        self.level = target

    def solve(self):
        self.clauses = list(self.original)
        self.assignment, self.levels, self.reasons = {}, {}, {}
        self.trail, self.level = [], 0
        self.stats = {"decisions": 0, "propagations": 0, "conflicts": 0,
                      "learned": 0, "backjumps": 0}
        while True:
            conflict = self._propagate()
            if conflict is not None:
                self.stats["conflicts"] += 1
                if self.level == 0:
                    return None
                clause, target = self._analyze(conflict)
                self._backtrack(target)
                self.clauses.append(clause)
                self.stats["learned"] += 1
                self.stats["backjumps"] += 1
                continue
            if len(self.assignment) == self.nvars:
                return dict(self.assignment)
            self.level += 1
            var = next(var for var in range(1, self.nvars + 1) if var not in self.assignment)
            self._enqueue(var, None)
            self.stats["decisions"] += 1

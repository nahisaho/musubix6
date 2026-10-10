from dataclasses import dataclass, field
from itertools import product
from smt.arithmetic import feasible
from smt.euf import closure
from smt.sat import CDCL
from smt.terms import Relation, Term


def negated_relations(atom):
    operations = {"eq": ("lt", "gt"), "le": ("gt",), "ge": ("lt",),
                  "lt": ("ge",), "gt": ("le",)}[atom.op]
    return tuple(Relation(atom.expression, op) for op in operations)


# @id CODE-SOLVER-001 @implements REQ-SOLVER-001 REQ-SOLVER-005 REQ-SOLVER-007
@dataclass
class Result:
    status: str
    boolean: dict | None = None
    arithmetic: dict | None = None
    euf: object = None
    stats: dict = field(default_factory=dict)


# @id CODE-SOLVER-002 @implements REQ-SOLVER-001 REQ-SOLVER-002 REQ-SOLVER-003 REQ-SOLVER-004 REQ-SOLVER-005 REQ-SOLVER-006 REQ-SOLVER-007
class Solver:
    def __init__(self):
        self.atoms, self.ids = {}, {}
        self.clauses, self.scopes = [], []

    def atom(self, value):
        valid = isinstance(value, Relation) or isinstance(value, str) and bool(value)
        valid |= isinstance(value, tuple) and len(value) == 2 and all(isinstance(t, Term) for t in value)
        if not valid:
            raise TypeError("atom must be a nullary proposition, real relation, or ground equality pair")
        if value not in self.ids:
            var = len(self.atoms) + 1
            self.ids[value], self.atoms[var] = var, value
        return self.ids[value]

    def add_clause(self, clause):
        clause = tuple(clause)
        CDCL(len(self.atoms), [clause])
        self.clauses.append(clause)

    def push(self):
        self.scopes.append(len(self.clauses))

    def pop(self):
        if not self.scopes:
            raise ValueError("scope underflow")
        del self.clauses[self.scopes.pop():]

    def _theories(self, boolean):
        equalities, disequalities, constraints, alternatives = [], [], [], []
        for var, atom in self.atoms.items():
            positive = boolean[var]
            if isinstance(atom, tuple):
                (equalities if positive else disequalities).append(atom)
            elif isinstance(atom, Relation):
                if positive:
                    constraints.append(atom)
                elif atom.op == "eq":
                    alternatives.append(negated_relations(atom))
                else:
                    constraints.extend(negated_relations(atom))
        euf = closure(equalities, disequalities)
        if euf is None:
            return None
        for selection in product(*alternatives):
            arithmetic = feasible(constraints + list(selection))
            if arithmetic is not None:
                return arithmetic, euf
        return None

    def check(self, budget=10000):
        if type(budget) is not int or budget < 0:
            raise ValueError("nonnegative theory candidate budget required")
        clauses = list(self.clauses)
        stats = {"candidates": 0, "theory_conflicts": 0, "learned": 0, "decisions": 0}
        for _ in range(budget):
            sat = CDCL(len(self.atoms), clauses)
            boolean = sat.solve()
            for key in ("learned", "decisions"):
                stats[key] += sat.stats[key]
            if boolean is None:
                return Result("unsat", stats=stats)
            stats["candidates"] += 1
            model = self._theories(boolean)
            if model is not None:
                arithmetic, euf = model
                return Result("sat", boolean, arithmetic, euf, stats)
            conflict = [-var if boolean[var] else var for var, atom in self.atoms.items()
                        if not isinstance(atom, str)]
            clauses.append(tuple(conflict))
            stats["theory_conflicts"] += 1
        return Result("unknown", stats=stats)

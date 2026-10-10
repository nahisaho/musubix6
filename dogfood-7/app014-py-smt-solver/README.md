# Mini SMT solver

Python 3.10+; runtime uses only the standard library. Run tests with `python3 -m pytest`.

Five modules implement immutable ground expressions, first-UIP CDCL, exact two-phase
rational simplex, union-find congruence closure, and lazy DPLL(T) with theory blocking.
This is ground quantifier-free linear real arithmetic plus a **disjoint**
uninterpreted sort. Boolean propositions are nullary. It is not a general SMT-LIB
parser, does not support shared real/EUF variables, and does not emit proof certificates.
Propagation scans clauses and congruence scans all applications; this favors a
small auditable implementation over high-performance watched literals.

## Python API

```python
from smt.solver import Solver
from smt.terms import Linear, Relation, Term

s = Solver()
x_gt_zero = s.atom(Relation(Linear({"x": 1}), "gt"))
s.add_clause([x_gt_zero])
s.push()
s.add_clause([-x_gt_zero])
assert s.check().status == "unsat"
s.pop()
result = s.check()
assert result.status == "sat" and result.arithmetic["x"] > 0
```

Relations compare a normalized linear expression against zero. Operations are
`le`, `ge`, `eq`, `lt`, `gt`. Coefficients are integers, `Fraction`, or rational
strings; floats are rejected. Terms are `Term("a")` or `Term("f", (Term("a"),))`.
An equality atom is `(left_term, right_term)`. Negative CNF literals negate atoms,
including real equality, which is searched as strict less/greater alternatives.
`push()`/`pop()` scope assertions, not atom declarations. Scope underflow is rejected.

`check(budget=10000)` returns `sat`, `unsat`, or `unknown` when its theory-candidate
budget is exhausted. Only SAT carries Boolean, rational and finite EUF models.
The budget counts complete Boolean candidates, not pivots or disequality branches;
it is not a wall-clock limit. Arbitrarily large inputs can be expensive.
`Result.stats` reports candidates, theory conflicts, CDCL learned clauses and decisions.

## JSON CLI

```sh
printf '%s\n' '{"atoms":[{"kind":"lra","coeffs":{"x":3},"op":"eq","rhs":1}],"clauses":[[1]]}' | python3 -m smt
```

Input atoms are Boolean `{"kind":"bool","name":"p"}`, real relations as above, or
EUF `{"kind":"euf","left":"a","right":{"symbol":"f","args":["a"]}}`.
Clause literals use one-based **declaration positions**, including duplicates.
Output rational values are strings (`"1/3"`); Boolean keys are interned variable IDs.
EUF `classes` exposes constant symbols; `terms` preserves structural term/value
records and `functions` supplies finite function tables. Missing function entries
default to class 0, with a singleton default universe if no terms occur.
Malformed input emits a JSON error, exits 2, and never evaluates executable text.

## Workflow evidence

`.sdd/plan.md` orders the five T2 features. Specifications, reviewed hash locks,
runtime spikes, traced tests and the hash-chained TDD ledger are included.
The suite includes CLI regression cycles, exact strict-bound examples, Boolean
backjumping and nested congruence, plus independent randomized oracle checks.
There are 44 requirements and 47 traced tests. Four explicit characterization
Reds (metadata and supplementary randomized oracles) are weak, not failing Reds.
The other 43 Reds fail before their implementations/fixes. Three CLI bug-fix
cycles and one signed-relation refactor cycle were completed.

The full SDD gate checks all 47 evidence records and the complete pytest suite.
`gate --changed` was exercised from the app directory with the same `--root`,
but still selected 0/0 evidence in this untracked nested repository layout;
only the **full** gate is relied on for evidence validation. This is the
already-reported nested-root limitation, not a new finding.

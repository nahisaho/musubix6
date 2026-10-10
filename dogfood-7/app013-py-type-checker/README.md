# Gradual Python subset checker

Python 3.10+; standard-library implementation, pytest tests, `src` layout.

```sh
python3 -m pytest
PYTHONPATH=src python3 -m pycheck --json examples/sample.py
```

CLI exit codes: **0** clean, **1** type/syntax/unsupported-subset diagnostics,
**2** unreadable input or argument errors. Diagnostic lines are one-based and JSON
columns are zero-based. Human-readable columns are one-based. No input program
is imported or executed.

## Modules and public APIs

* `types.canonical`, `compatible`, `replace`: immutable union algebra, numeric
  widening, `Any` consistency, `Never`, mutable invariance, covariant sequences
  and tuples, contravariant callable parameters, safe AST annotation parsing.
* `hm.infer`, `infer_let`: fresh variables, substitutions, occurs checking,
  environment-free let-generalization, higher-order functions, heterogeneous
  lists and dictionaries. Only immutable expressions are supported; mutation and
  mutating method calls are intentionally excluded.
* `contracts.instantiate`, `bind`: explicit bounded generics and nested argument
  inference. Union inference supports one variable-bearing alternative; ambiguous
  unions are rejected. `satisfies` checks structural protocol member dictionaries;
  `method_compatible` checks parameter/return variance. Writable members are
  invariant; read-only members are covariant. Protocol class syntax is not parsed.
* `flow.branches`, `join`: immutable positive/negative environments, None checks,
  verified builtin `isinstance`, boolean guard composition, runtime subclassing
  independent of numeric widening, and definite-assignment intersection.
* `checker.check`: module assignments, annotations, functions with positional
  parameters, calls, expressions, and `if`/`else`; contextual empty literals,
  branch annotations, return/fallthrough checking and structured diagnostics.

Annotations include primitives, `T`/`U`/numbered variables, PEP 604 and `Union`
unions, `Optional`, `list`, `set`, `dict`, fixed `tuple`, `Sequence`, and
`Callable[[parameters], result]`. `bool <: int <: float` applies to assignment,
but `isinstance(x, float)` never narrows an integer to float.

This is deliberately **not** a complete CPython checker: imports, loops,
comprehensions, user classes, decorators, default/keyword/variadic parameters,
attribute writes, exceptions, and side-effectful methods are rejected. Generic
and protocol declarations are supplied through the Python APIs rather than
executed `typing` declarations.

## Workflow evidence

Five T2 features, 49 requirements (one characterized formatting contract),
ten bug-fix cycles across eight regression IDs, a source refactor and a
wording-only spec refactor.
`.sdd/plan.md` records dependencies; `.sdd/tdd.jsonl` retains the hash-chained
Red→Green ledger. The final full gate checks all 49 tests. The changed gate is
also exercised but the full gate is authoritative in this nested, untracked app.
All pytest scratch data stays beneath this app.

```sh
S="node ../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs"
$S --root "$PWD" impact REQ-TYPES-004
$S --root "$PWD" gate --changed
$S --root "$PWD" gate
```

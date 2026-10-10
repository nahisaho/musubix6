# Python authorization policy engine

Python 3.10+; pytest is the only test dependency. No runtime dependencies.

```python
from policy.engine import decide
from policy.analysis import analyze
from policy.roles import allowed

rules = [
    {"id": "adult-reader", "effect": "Permit",
     "when": 'subject.age >= 18 and action.name in ["read", "list"]',
     "roles": ["reader"], "obligations": ["audit"]},
    {"id": "blocked", "effect": "Deny", "when": "subject.blocked == True"},
]
request = {
    "subject": {"age": 21, "roles": ["editor"], "blocked": False},
    "action": {"name": "read"},
}
result = decide(rules, request, hierarchy={"editor": ["reader"], "reader": []})
assert result["authorized"]
assert result["obligations"] == ["audit"]
diagnostics = analyze(rules)  # Conservative possible overlap, not a proof.
```

## Contracts

- DSL: public dotted paths rooted at `subject`, `resource`, `action`, or `env`;
  literals, literal lists/tuples, chained comparisons, `in`/`not in`, and
  `and`/`or`/`not`. Missing attributes and incomparable types are evaluation errors.
  Boolean operations short-circuit. Calls, indexing, private attributes,
  comprehensions and arithmetic are rejected. Expressions are bounded to 256 AST
  nodes and 16,384 characters; no `eval` or `exec`.
- RBAC: assigned roles must be a list/tuple of declared strings. All hierarchy
  nodes are validated, including unused nodes. Cycles and unknown parents reject;
  1,500-level inheritance is supported. `allowed` matches action and resource
  with case-sensitive shell patterns.
- Effects are `Permit`/`Deny`; outcomes additionally include `NotApplicable` and
  `Indeterminate`. Only a final `Permit` authorizes. Missing attributes affect
  their rule, then the selected combination algorithm is applied.
- Combination: deny-overrides prioritizes Deny, Indeterminate, Permit;
  permit-overrides prioritizes Permit, Indeterminate, Deny; first-applicable
  returns the first non-neutral outcome; only-one-applicable returns Indeterminate
  when more than one non-neutral rule exists. Empty input is NotApplicable.
- Explanations evaluate every rule in input order, including rules after the
  first applicable result. Reasons never include request values. Obligations are
  unique, ordered, and collected from rules matching the final Permit/Deny.
- Static analysis proves overlap/disjointness for public-path equality
  conjunctions and literal True/False. Scalar ancestor-path constraints cannot
  coexist with nested attributes. Other expressions and role-restricted overlaps
  are conservative `possible` diagnostics, not complete satisfiability proofs.

## Verification

Run from this directory:

```sh
python3 spikes.py
python3 -m pytest -q
node ../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs --root "$PWD" gate
```

Five T2 features, 44 requirements/tests, full Cartesian combination tables,
two regression bug-fix cycles and an obligation refactor. Specs and locked
evidence are under `.sdd/`. The wording-only spec edit after Green deliberately
exercises stale-evidence rejection and `tdd refactor` renewal.

`gate --changed` was exercised from this directory with this directory as root.
The already-reported enclosing-repository path bug reports zero changed tests;
the full gate, not the changed gate, is the verification authority.

New dogfood defect: multiline Python test signatures with docstring annotations
can change defaults without invalidating Red hashes. The reproducible standalone
fixture and report are in `../findings/`; this app uses comment annotations.

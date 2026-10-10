# PDDL-lite planner

Python 3 typed STRIPS planner with immutable actions, Cartesian grounding,
delete-relaxation hFF, weighted A* / GBFS and independent plan replay.

```sh
python3 -m planner examples/transport.domain examples/trip.problem
python3 -m planner examples/transport.domain examples/trip.problem --algorithm gbfs
python3 -m pytest -q
PYTHONPATH=. python3 .sdd/spike.py
```

Library entry points:

- `parse_domain(text)`, `parse_problem(text)` parse single S-expressions.
- `ground(domain, problem)` checks symbols, types, arities and variable binding.
- `hff(task, state)` counts actions in an extracted delete-relaxed plan; infinity
  indicates relaxed unreachability. It is **not admissible**.
- `solve(task, algorithm="astar", heuristic=None, limit=100000)` uses zero
  heuristic for optimal weighted A* by default. GBFS uses hFF and is not optimal.
  Custom A* heuristics must be admissible to retain optimality.
- `validate(task, labels)` independently replays exact grounded labels and checks
  the goal. Failures report the zero-based failing step and partial state/cost.

Supported syntax: `:strips`, `:typing`, flat `:types`, typed `:predicates`,
positive/conjunctive preconditions and goals, positive/delete effects, typed
`:objects`, `:init`, and optional positive integer action `:cost` (a lite
extension, not numeric PDDL). Identifiers are case-insensitive PDDL symbols.
Parameterless actions and empty conjunctions are supported. Quantifiers,
equality, negative preconditions/goals, constants and type inheritance are
deliberately unsupported and rejected.

CLI JSON includes status, plan, cost, expanded, generated, valid. Exit codes:
0 solved and independently validated; 1 unsolvable; 2 invalid input; 3 expansion
limit. `--limit 0` still solves an already-satisfied goal without expanding.
Expansion counts omit stale queue entries; generation counts include the initial
state and improved paths.

## SDD evidence

Five T2 feature specs cover 43 requirements. Fourteen annotated tests cover the
contracts. The ledger records initial Red/Green evidence, malformed-parser and
identity/replay bug fixes, and priority-function refactoring. Independent reviews
and their resolved findings are in `.sdd/review.md`.

Use the app directory as both cwd and `--root`:

```sh
S='node ../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs'
$S --root "$PWD" gate --changed
$S --root "$PWD" gate
```

The already-known nested-repository changed-path defect can still yield zero
changed-scope evidence in this untracked app; the full gate is authoritative.
The helper-hash repro in `../findings/repro-app022-helper/` is intentionally
separate from this application's passing tests.

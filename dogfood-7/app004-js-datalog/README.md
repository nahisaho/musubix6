# Typed Datalog, in JavaScript

Zero-dependency JavaScript ESM engine, Node >=20. Five modules implement parsing,
range restriction/stratification, semi-naive evaluation, magic-set rewriting, and
bounded provenance traversal.

```sh
npm test
npm run demo
node ../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs --root "$PWD" gate
```

```js
import {
  parse, evaluate, query, magicRewrite, explain, formatExplanation
} from './src/index.js';

const program = parse(`
  edge(a,b). edge(b,c).
  path(X,Y) :- edge(X,Y).
  path(X,Z) :- edge(X,Y), path(Y,Z).
`);
const target = parse('?- path(a,Y).').queries[0];
const demand = magicRewrite(program, target);
const result = evaluate(demand.program);
console.log(query(result, demand.query)); // [['a','b'], ['a','c']]
console.log(formatExplanation(explain(result, demand.query.predicate, ['a', 'c'])));
```

## Language

- Predicate names start lowercase. Every atom uses parentheses, including
  zero-arity atoms (`ready()`); statements end in `.`.
- Constants are lowercase symbols, single/double quoted strings, or finite signed
  decimal numbers. Symbols and strings share the string domain; numbers do not
  coerce to strings. Quotes support `\\`, `\"`, `\'`, `\n`, `\r`, `\t`.
- Variables start uppercase or underscore. `_` is an independent wildcard, allowed
  only in positive body atoms and queries.
- Bodies are conjunctions of positive atoms, `not atom(...)`, and comparisons
  `= != < <= > >=`. Equality is strict; ordering compares only like-typed values.
  Positive atoms bind variables before filters regardless of source order.
- All head, negative, and comparison variables must occur in a positive body atom.
  Predicates have fixed arity. Negative dependency cycles are rejected.
- `%` and `//` start comments outside strings.
- No functions, arithmetic generation, aggregation, disjunction, persistence, or
  incremental deletion. Negation is the stratified closed-world interpretation.

## Public API

`parse(source)` returns `{facts, rules, queries}` with typed terms and source-order
rule IDs `r1`, `r2`, etc. Syntax errors include line/column.
`stratify(ast)` returns `strata`/`arity` Maps and ordered rule groups.

`evaluate(sourceOrAst, options)` returns relation Maps, provenance, plan, and work
statistics. It copies supplied ASTs. `tuples(result, predicate)` returns detached
arrays. `query(result, atomOrQueryString)` returns matching complete tuples, not
binding objects; a string must contain exactly one query and no other statements.
Known-predicate arity mismatches are errors; an unknown predicate has no answers.

Evaluation options (positive safe integers):

| Option | Default | Meaning |
| --- | ---: | --- |
| `strategy` | `semi-naive` | Or `naive`, used as a differential oracle |
| `maxIterations` | 10000 | Rule-group rounds across strata |
| `maxFacts` | 100000 | Unique base and derived tuples |
| `maxWork` | 1000000 | Join attempts plus generated candidates |
| `maxProofs` | 250000 | Unique derivations across all tuples |

Exceeded budgets throw; no partial result is returned.

`magicRewrite(ast, queryAtom)` returns `{program, query, stats}` without changing
the input. Positive intensional calls receive `__bf`/`__ff` adornments and
`magic_` guards. Ground facts of mixed base/derived predicates are demand-filtered
into every used adornment. Negative predicates retain their full original
dependency closure. `magic_` prefixes and `__` inside input predicate names are
reserved and rejected. The rewritten query predicate names its specialized relation;
original queries must not be used against the rewritten result.

`explain(result, predicate, tuple, options)` returns a detached, JSON-serializable
proof or `null`. It retains alternate proofs, base flags, rule IDs, bindings and
absent negative tuples. Revisited facts become cycle references.
Options are nonnegative safe integers: `maxDepth=50`, `maxDerivations=100` per fact,
and `maxNodes=10000` expanded fact nodes globally. Truncation markers do not count
as expanded facts; marker overhead is bounded by traversal depth.
`formatExplanation(tree)` renders the proof deterministically.

Direct AST APIs require parser-produced structures; result Maps are inspectable
but callers should not mutate them.

## Workflow evidence

`.sdd/plan.md` orders five T2 features. Forty-five REQs have recorded Red/Green
evidence, with five subsequent bug-fix regressions and a scheduling refactor.
The weak query Red is intentionally retained: its initial failure came from the
evaluation setup, not the asserted query operation. Full gates validate all
evidence. Nested-root `gate --changed` has a reproduced scoping defect; use full
`gate` until the upstream tool is repaired. Findings live in
`../findings/app004.md`, not the engine source.

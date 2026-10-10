# TypeScript cost-based SQL query optimizer

Node 24+; three npm workspaces: `@query/algebra`, `@query/optimizer`, and
`@query/cli`. No database, parser, or runtime dependencies. Input is logical SQL
algebra as JSON, not SQL text.

```sh
npm install
npm run build
npm test
npm run demo
node packages/cli/src/main.ts --json examples/query.json
cat examples/query.json | node packages/cli/src/main.ts
```

The algebra supports scans (table, alias, unqualified column schema), filters,
ordered projections, inner joins, JSON literals, qualified column references,
eq/ne/lt/le/gt/ge and AND/OR. The interpreter implements SQL NULL/UNKNOWN and
bag semantics. Scan aliases and column/table names are identifier-like; joins
cannot reuse aliases. Missing input row fields are NULL. Ordering is only
defined for like-typed strings/numbers; equality never coerces types.

Catalogs snapshot finite nonnegative row counts and column distinct counts,
with `nullFraction` in [0,1]. Unknown tables use 1000 rows, unknown columns
10 distinct values. Equality uses non-null fraction / distinct count; joins
use maximum distinct count. AND/OR use independence, inequalities use 1/3.
Estimates are heuristic; costs sum output rows and child work and saturate at
`Number.MAX_SAFE_INTEGER`.
Intermediate row products are uncapped, with log-domain recovery across numeric
overflow, so a selective parent can recover a small final estimate.
AND/OR selectivity retains its log-domain magnitude across probability underflow.

Normalization folds boolean expressions, merges filters, pushes one-sided
filters beneath joins, retains cross-side predicates and removes identity
projections. Pure custom rules transform the root once per pass. Repeated
nonconsecutive fingerprints fail; default rewrite budget is 32 passes.

Join ordering enumerates all bushy subset partitions (O(3^n), O(2^n) states),
retains every equijoin edge once, and uses canonical tie breaks. Graphs are
limited to 12 relations. Cross joins remain eligible for global cost optimality.
The pipeline flattens only scan-only inner join regions with equijoin edges;
other regions are recursively optimized without moving filters across
boundaries. Output schema order is restored with projection, and a cost
comparison falls back to the original plan if the candidate is more expensive.

`optimize(plan, stats, {maxPasses, maxRelations})` returns the plan, row estimate,
cost, original cost, rule audit, explored candidate count and catalog.
`printPlan` and `explainJSON` expose operator trees, cumulative cost and rows.
CLI errors go to stderr with status 1; success emits text or `--json`.

SDD specs, locks, trace annotations and Red/Green evidence live in `.sdd/`.
Run its script from this directory with `--root .`; see `.sdd/plan.md`.
There are 48 traced requirements and 52 tests, including differential row-bag,
NULL, numerical overflow/underflow, malformed input and CLI checks. Always run
the full SDD gate: the nested-root changed-scope defect is reproduced and
documented in `../findings/app001.md`.
